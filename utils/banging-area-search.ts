import type { PlannerSearchResult } from '@/components/PandaPlannerSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';

type Coordinates = { latitude: number; longitude: number };
const cache = new Map<string, { expires: number; results: PlannerSearchResult[] }>();
const flights = new Map<string, Promise<PlannerSearchResult[]>>();
const failures = new Map<string, { expires: number; error: Error }>();

export async function fetchWithDeadline(input: string, init: RequestInit = {}, milliseconds = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// The same approximately 5 km area centre is sent by every nearby phone.
// Existing external backend cache therefore shares one result for three hours.
export function getBangingAreaResults(origin: Coordinates): Promise<PlannerSearchResult[]> {
  const latitude = Math.round(origin.latitude * 20) / 20;
  const longitude = Math.round(origin.longitude * 20) / 20;
  const key = `${latitude}:${longitude}`;
  const stored = cache.get(key);
  if (stored && stored.expires > Date.now()) return Promise.resolve(stored.results);
  const failed = failures.get(key);
  if (failed && failed.expires > Date.now()) return Promise.reject(failed.error);
  if (flights.has(key)) return flights.get(key)!;
  for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey);
  const params = new URLSearchParams({
    query: 'fine dining restaurants and cocktail bars',
    latitude: String(latitude), longitude: String(longitude),
  });
  const promise = fetchWithDeadline(`${PANDA_RUNTIME_API}/api/partner/venues?${params}`)
    .then(async response => {
      if (!response.ok) throw new Error(`Banging area lookup unavailable (${response.status})`);
      const body = await response.json() as { results?: PlannerSearchResult[] };
      const results = Array.isArray(body.results) ? body.results : [];
      cache.set(key, { results, expires: Date.now() + 3 * 60 * 60 * 1000 });
      failures.delete(key);
      return results;
    }).catch(error => {
      failures.set(key, { expires: Date.now() + 60_000, error });
      throw error;
    }).finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}
