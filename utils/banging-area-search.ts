import type { PlannerSearchResult } from '@/components/PandaPlannerSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';

type Coordinates = { latitude: number; longitude: number };
export type BangingResult = PlannerSearchResult & {
  luxurySource?: string; neighborhood?: string;
  bangingTransitMinutes?: number; bangingVerifiedAt?: number;
};
export type BangingArea = {
  results: BangingResult[];
  premiumJourneys: Record<string, { bangingTransitMinutes: number; bangingVerifiedAt: number }>;
  complete: boolean;
};
const cache = new Map<string, { expires: number; results: BangingArea }>();
const flights = new Map<string, Promise<BangingArea>>();
const failures = new Map<string, { expires: number; error: Error }>();

export async function fetchWithDeadline(input: string, init: RequestInit = {}, milliseconds = 15000) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
}

// The backend shares one luxury directory and route matrix across nearby
// phones, and separately verifies the access leg from this phone's location.
export function getBangingAreaResults(origin: Coordinates, premiumIds: string[] = []): Promise<BangingArea> {
  const latitude = Number(origin.latitude.toFixed(4));
  const longitude = Number(origin.longitude.toFixed(4));
  const ids = [...new Set(premiumIds)].sort().slice(0, 10);
  const key = `${latitude}:${longitude}:${ids.join(',')}`;
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) return Promise.resolve(stored.results);
  const failed = failures.get(key);
  if (failed && failed.expires > Date.now()) return Promise.reject(failed.error);
  if (flights.has(key)) return flights.get(key)!;
  for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey);
  const params = new URLSearchParams({
    banging: '1', premium_ids: ids.join(','),
    latitude: String(latitude), longitude: String(longitude),
  });
  const promise = fetchWithDeadline(`${PANDA_RUNTIME_API}/api/partner/venues?${params}`, {}, 120000)
    .then(async response => {
      if (!response.ok) throw new Error(`Banging area lookup unavailable (${response.status})`);
      const body = await response.json() as BangingArea & { expiresAt: number };
      if (!Array.isArray(body.results) || !body.premiumJourneys || !Number.isFinite(body.expiresAt)) {
        throw new Error('Banging returned incomplete travel verification');
      }
      const results = body;
      cache.set(key, { results, expires: Math.min(body.expiresAt, Date.now() + 3 * 60 * 60 * 1000) });
      failures.delete(key);
      return results;
    }).catch(error => {
      failures.set(key, { expires: Date.now() + 60_000, error });
      throw error;
    }).finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}
