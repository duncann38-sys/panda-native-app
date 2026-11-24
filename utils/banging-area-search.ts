import type { PlannerSearchResult } from '@/components/PandaPlannerSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Coordinates = { latitude: number; longitude: number };
export type BangingResult = PlannerSearchResult & {
  latitude?: number;
  longitude?: number;
  priceLevel?: number;
  luxurySource?: string;
  neighborhood?: string;
  bangingTransitMinutes?: number;
  bangingVerifiedAt?: number;
  bangingFallback?: boolean;
  bangingFallbackSource?: 'storage' | 'nearby' | 'curated';
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
const LOCAL_FALLBACK_TTL_MS = 3 * 60 * 60 * 1000;

function fallbackStorageKey(origin: Coordinates) {
  return `panda:banging:fallback:v1:${origin.latitude.toFixed(2)}:${origin.longitude.toFixed(2)}`;
}

const HIGH_END_TERMS = /\b(fine dining|tasting menu|michelin|chef'?s table|omakase|upscale|luxury hotel|destination dining|private dining|rooftop|cocktail)\b/i;
const FAST_CASUAL_OR_TAKEAWAY = /\b(fast[- ]?food|quick service|take[- ]?away|meal takeaway|drive[- ]?thru|food court)\b/i;
const KNOWN_CHAINS = /\b(mcdonald'?s|kfc|burger king|subway|domino'?s|pizza hut|pizza ?express|zizzi|prezzo|ask italian|bella italia|frankie and benny'?s|tgi fridays|wagamama|nando'?s|five guys|taco bell|leon|itsu|greggs|pret a manger|costa coffee|starbucks|shake shack|papa john'?s|yo!? sushi)\b/i;

function estimateReachMinutes(origin: Coordinates, venue: BangingResult) {
  const latitude = Number(venue.lat ?? venue.latitude);
  const longitude = Number(venue.lng ?? venue.longitude);
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

function isCacheEligible(venue: BangingResult) {
  const rating = Number(venue.rating);
  const latitude = Number(venue.lat ?? venue.latitude);
  const longitude = Number(venue.lng ?? venue.longitude);
  const priceLevel = Number.isFinite(venue.priceLevel)
    ? Number(venue.priceLevel)
    : (String(venue.price || '').match(/[£$]/g) || []).length;
  const identity = [venue.name, venue.type, venue.primaryType, ...(venue.types || [])].join(' ');
  const restaurant = /\brestaurant\b/i.test(identity);
  const upscale = Boolean(venue.luxurySource)
    || (priceLevel >= 3 && HIGH_END_TERMS.test(identity));
  return Boolean(venue.id && venue.name)
    && Number.isFinite(rating) && rating >= 4.5 && rating <= 5
    && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && restaurant && upscale
    && !FAST_CASUAL_OR_TAKEAWAY.test(identity)
    && !KNOWN_CHAINS.test(String(venue.name));
}

function mergeResults(primary: BangingResult[], fallback: BangingResult[], targetCount: number) {
  const result: BangingResult[] = [];
  const seen = new Set<string>();
  for (const venue of [...primary, ...fallback]) {
    if (!venue.id || seen.has(venue.id)) continue;
    seen.add(venue.id);
    result.push(venue);
    if (result.length >= targetCount) break;
  }
  return result;
}

async function readLocalFallback(origin: Coordinates, premiumCount: number): Promise<BangingArea | null> {
  try {
    if (!Number.isFinite(origin.latitude) || Math.abs(origin.latitude) > 90
        || !Number.isFinite(origin.longitude) || Math.abs(origin.longitude) > 180) return null;
    const key = fallbackStorageKey(origin);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { expiresAt?: number; results?: BangingResult[] };
    if (!Number.isFinite(saved.expiresAt) || saved.expiresAt! <= Date.now()
        || !Array.isArray(saved.results)) {
      void AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    const results = saved.results.flatMap(venue => {
      if (!isCacheEligible(venue) || venue.bangingFallback === true
          || venue.bangingFallbackSource === 'storage') return [];
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

export function readBangingDeviceCache(origin: Coordinates, premiumCount = 0) {
  return readLocalFallback(origin, premiumCount);
}

async function fetchWithDeadline(input: string, milliseconds = 5_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Banging lookup timed out after ' + milliseconds + 'ms'));
    }, milliseconds);
  });
  try {
    return await Promise.race([fetch(input, { signal: controller.signal }), deadline]);
  } finally {
    clearTimeout(timer!);
  }
}

export function getBangingAreaResults(origin: Coordinates, premiumIds: string[] = []): Promise<BangingArea> {
  const latitude = Number(origin.latitude.toFixed(4));
  const longitude = Number(origin.longitude.toFixed(4));
  const ids = [...new Set(premiumIds)].sort().slice(0, 10);
  const targetCount = ids.length ? 40 : 50;
  const key = [latitude, longitude, ids.join(',')].join(':');
  const localPromise = readLocalFallback(origin, ids.length);
  const mergeWithDeviceCache = (body: BangingArea, local: BangingArea | null): BangingArea => {
    const googleResults = body.results.filter(venue =>
      venue.bangingFallback !== true && venue.bangingFallbackSource !== 'storage');
    const results = mergeResults(googleResults, local?.results || [], targetCount);
    const usedDeviceCache = results.some(venue => venue.bangingFallbackSource === 'storage');
    return {
      ...body,
      results,
      complete: results.length >= targetCount,
      travelMode: usedDeviceCache ? 'transit_or_estimated' : body.travelMode,
      fallbackReason: usedDeviceCache
        ? googleResults.length ? 'device_cache_supplement' : body.fallbackReason || 'local_storage_cache'
        : body.fallbackReason,
    };
  };
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) {
    return localPromise.then(local => mergeWithDeviceCache(stored.results, local));
  }
  const failed = failures.get(key);
  if (failed && failed.expires > Date.now()) {
    return localPromise.then(local => local || Promise.reject(failed.error));
  }
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
  const promise = (async () => {
    try {
      const response = await fetchWithDeadline(PANDA_RUNTIME_API + '/api/partner/venues?' + params);
      if (!response.ok) throw new Error('Banging area lookup unavailable (' + response.status + ')');
      const body = await response.json() as BangingArea & { expiresAt: number };
      if (!Array.isArray(body.results) || !body.premiumJourneys || !Number.isFinite(body.expiresAt)) {
        throw new Error('Banging returned incomplete travel verification');
      }
      const googleResults = body.results.filter(venue =>
        venue.bangingFallback !== true && venue.bangingFallbackSource !== 'storage');
      const googleBody: BangingArea = { ...body, results: googleResults };
      if (googleResults.length) {
        const expires = Math.min(body.expiresAt, Date.now() + 3 * 60 * 60 * 1000);
        cache.set(key, { results: googleBody, expires });
        const cacheable = googleResults.filter(isCacheEligible);
        if (cacheable.length) {
          void AsyncStorage.setItem(fallbackStorageKey(origin), JSON.stringify({
            expiresAt: Date.now() + LOCAL_FALLBACK_TTL_MS,
            results: cacheable,
          })).catch(() => {});
        }
      }
      failures.delete(key);
      const local = await readLocalFallback(origin, ids.length);
      return mergeWithDeviceCache(googleBody, local);
    } catch (error) {
      failures.set(key, { expires: Date.now() + 60_000, error: error as Error });
      const local = await readLocalFallback(origin, ids.length);
      if (local) return local;
      throw error;
    } finally {
      flights.delete(key);
    }
  })();
  flights.set(key, promise);
  return promise;
}
