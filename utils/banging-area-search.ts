import type { PlannerSearchResult } from '@/components/PandaPlannerSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';

type Coordinates = { latitude: number; longitude: number };
export type BangingResult = PlannerSearchResult & {
  luxurySource?: string;
  neighborhood?: string;
  bangingTransitMinutes?: number;
  bangingVerifiedAt?: number;
};
export type BangingArea = {
  results: BangingResult[];
  premiumJourneys: Record<string, { bangingTransitMinutes: number; bangingVerifiedAt: number }>;
  complete: boolean;
};

const cache = new Map<string, { expires: number; results: BangingArea }>();
const flights = new Map<string, Promise<BangingArea>>();

async function fetchWithDeadline(input: string, milliseconds = 120_000) {
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
      cache.set(key, { results: body, expires: Math.min(body.expiresAt, Date.now() + 3 * 60 * 60 * 1000) });
      return body;
    })
    .finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}
