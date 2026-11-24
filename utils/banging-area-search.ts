import type { PlannerSearchResult } from '@/components/PandaPlannerSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Coordinates = { latitude: number; longitude: number };
export type BangingResult = PlannerSearchResult & {
  luxurySource?: string;
  neighborhood?: string;
  bangingTransitMinutes?: number;
  bangingVerifiedAt?: number;
  bangingFallback?: boolean;
  bangingFallbackSource?: 'storage';
  bangingTransitEstimated?: boolean;
};
export type BangingArea = {
  results: BangingResult[];
  premiumJourneys: Record<string, { bangingTransitMinutes: number; bangingVerifiedAt: number }>;
  complete: boolean;
  travelMode?: 'transit' | 'estimated' | 'transit_or_estimated';
  fallbackReason?: string;
  expiresAt?: number;
};

const cache = new Map<string, { expires: number; results: BangingArea }>();
const flights = new Map<string, Promise<BangingArea>>();
const failures = new Map<string, { expires: number; error: Error }>();
const LOCAL_FALLBACK_TTL_MS = 5 * 60 * 1000;

function fallbackStorageKey(origin: Coordinates) {
  return `panda:banging:fallback:v1:${origin.latitude.toFixed(2)}:${origin.longitude.toFixed(2)}`;
}

function estimateReachMinutes(origin: Coordinates, venue: BangingResult) {
  const latitude = Number(venue.latitude);
  const longitude = Number(venue.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(latitude - origin.latitude);
  const longitudeDelta = radians(longitude - origin.longitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  const distanceKm = (6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))) / 1_000;
  const estimate = Math.ceil(15 + distanceKm * 2.1);
  return estimate > 0 && estimate < 120 ? estimate : null;
}

async function readLocalFallback(origin: Coordinates, premiumCount: number): Promise<BangingArea | null> {
  try {
    if (!Number.isFinite(origin.latitude) || Math.abs(origin.latitude) > 90
        || !Number.isFinite(origin.longitude) || Math.abs(origin.longitude) > 180) return null;
    const raw = await AsyncStorage.getItem(fallbackStorageKey(origin));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { expiresAt?: number; results?: BangingResult[] };
    if (!Number.isFinite(saved.expiresAt) || saved.expiresAt! <= Date.now()
        || !Array.isArray(saved.results)) {
      void AsyncStorage.removeItem(fallbackStorageKey(origin)).catch(() => {});
      return null;
    }
    const results = saved.results.flatMap(venue => {
      const rating = Number(venue?.rating);
      if (!venue?.id || !venue.name || !Number.isFinite(rating) || rating < 4.5 || rating > 5
          || venue.bangingFallbackSource !== 'storage') return [];
      const estimated = estimateReachMinutes(origin, venue);
      return estimated === null ? [] : [{
        ...venue,
        bangingFallback: true,
        bangingFallbackSource: 'storage' as const,
        bangingTransitEstimated: true,
        bangingTransitMinutes: estimated,
        bangingVerifiedAt: undefined,
      }];
    }).slice(0, premiumCount ? 40 : 50);
    if (!results.length) return null;
    return {
      results,
      premiumJourneys: {},
      complete: results.length >= (premiumCount ? 40 : 50),
      travelMode: 'estimated',
      fallbackReason: 'local_storage_cache',
      expiresAt: saved.expiresAt,
    };
  } catch {
    return null;
  }
}

async function fetchWithDeadline(input: string, milliseconds = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getBangingAreaResults(origin: Coordinates, premiumIds: string[] = []): Promise<BangingArea> {
  const latitude = Number(origin.latitude.toFixed(4));
  const longitude = Number(origin.longitude.toFixed(4));
  const ids = [...new Set(premiumIds)].sort().slice(0, 10);
  const key = `${latitude}:${longitude}:${ids.join(',')}`;
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) return Promise.resolve(stored.results);
  const failed = failures.get(key);
  if (failed && failed.expires > Date.now()) return Promise.reject(failed.error);
  if (failed) failures.delete(key);
  const existing = flights.get(key);
  if (existing) return existing;
  for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey);
  const params = new URLSearchParams({
    banging: '1',
    premium_ids: ids.join(','),
    latitude: String(latitude),
    longitude: String(longitude),
  });
  const promise = fetchWithDeadline(`${PANDA_RUNTIME_API}/api/partner/venues?${params}`)
    .then(async response => {
      if (!response.ok) throw new Error(`Banging area lookup unavailable (${response.status})`);
      const body = await response.json() as BangingArea & { expiresAt: number };
      if (!Array.isArray(body.results) || !body.premiumJourneys || !Number.isFinite(body.expiresAt)) {
        throw new Error('Banging returned incomplete travel verification');
      }
      const expires = Math.min(body.expiresAt, Date.now() + 3 * 60 * 60 * 1000);
      cache.set(key, { results: body, expires });
      if (body.travelMode === 'estimated' && body.results.length > 0
          && body.results.every(venue => venue.bangingFallback === true
            && venue.bangingFallbackSource === 'storage')) {
        void AsyncStorage.setItem(fallbackStorageKey(origin), JSON.stringify({
          expiresAt: Math.min(expires, Date.now() + LOCAL_FALLBACK_TTL_MS),
          results: body.results,
        })).catch(() => {});
      }
      failures.delete(key);
      return body;
    })
    .catch(error => {
      failures.set(key, { expires: Date.now() + 60_000, error });
      throw error;
    })
    .finally(() => flights.delete(key));
  flights.set(key, promise);
  const local = readLocalFallback(origin, ids.length).then(result => {
    if (!result) return new Promise<BangingArea>(() => {});
    const expires = result.expiresAt ?? Date.now() + LOCAL_FALLBACK_TTL_MS;
    cache.set(key, { results: result, expires });
    return result;
  });
  return Promise.race([local, promise]);
}
