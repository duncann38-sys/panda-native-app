import type { Venue } from '@/data/venues';
import { classifyGooglePlace, type DiscoveryCategory } from '@/data/venue-categories';
import { hydrateVenueDetails, type DeferredVenueProfile } from './venue-detail-hydration';

export type PlannerVenueProfile = DeferredVenueProfile & {
  name?: string;
  highlights?: Array<{ key: string; label?: string }>;
};

export type PlannerSelection = { key: string; venues: Array<Venue | null> };

export function retainPlannerSelection(
  previous: PlannerSelection | null, key: string, venues: Array<Venue | null>, stopCount: number,
): PlannerSelection {
  if (previous?.key === key && previous.venues.length === stopCount
    && previous.venues.every((venue) => venue && hasVerifiedPlannerFacts(venue))) return previous;
  return { key, venues };
}

/** Unknown prices are not proof that a venue is within the selected budget. */
export function hasVerifiedPlannerFacts(venue: Venue): boolean {
  return /^ChI[\w-]+$/.test(venue.id)
    && /^£{1,4}$/.test(String(venue.price ?? '').trim())
    && Number.isFinite(Number(venue.rating)) && Number(venue.rating) >= 4
    && typeof venue.latitude === 'number' && Number.isFinite(venue.latitude) && Math.abs(venue.latitude) <= 90
    && typeof venue.longitude === 'number' && Number.isFinite(venue.longitude) && Math.abs(venue.longitude) <= 180;
}

/** Memory-only provider facts; shared requests keep their original expiry. */
export function createPlannerProfileLoader(
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const cache = new Map<string, { profile: PlannerVenueProfile; expires: number }>();
  const pending = new Map<string, Promise<PlannerVenueProfile | null>>();
  let blockedUntil = 0;
  return function loadProfile(id: string): Promise<PlannerVenueProfile | null> {
    if (!/^ChI[\w-]+$/.test(id)) return Promise.resolve(null);
    const cached = cache.get(id);
    if (cached && cached.expires > now()) return Promise.resolve(cached.profile);
    if (blockedUntil > now()) return Promise.resolve(null);
    if (pending.has(id)) return pending.get(id)!;
    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      try {
        const response = await fetchImpl(`${apiBase}/api/partner/venues/${encodeURIComponent(id)}/profile`, {
          headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (!response.ok) {
          if ([403, 429, 500, 502, 503, 504].includes(response.status)) blockedUntil = now() + 30_000;
          return null;
        }
        const profile = await response.json() as PlannerVenueProfile;
        if (profile.id !== id) return null;
        cache.set(id, { profile, expires: now() + 5 * 60_000 });
        while (cache.size > 100) cache.delete(cache.keys().next().value!);
        return profile;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  };
}

/** Check a small, role-diverse pool, never every ID in the nearby index. */
export async function verifyPlannerCandidates(
  candidates: Venue[],
  loadProfile: (id: string) => Promise<PlannerVenueProfile | null>,
  signal: AbortSignal,
): Promise<Venue[]> {
  const buckets = new Map<string, Venue[]>();
  for (const venue of candidates) {
    if (!/^ChI[\w-]+$/.test(venue.id)) continue;
    const bucket = buckets.get(venue.category) ?? [];
    if (!bucket.some((item) => item.id === venue.id)) bucket.push(venue);
    buckets.set(venue.category, bucket);
  }
  const selected: Venue[] = [];
  const seen = new Set<string>();
  for (let round = 0; selected.length < 12; round += 1) {
    let found = false;
    for (const bucket of buckets.values()) {
      const venue = bucket[round];
      if (venue && !seen.has(venue.id)) {
        selected.push(venue);
        seen.add(venue.id);
        found = true;
        if (selected.length === 12) break;
      }
    }
    if (!found) break;
  }
  const verified = new Array<Venue | null>(selected.length).fill(null);
  let index = 0;
  await Promise.all([0, 1].map(async () => {
    while (!signal.aborted && index < selected.length) {
      const position = index++;
      const venue = selected[position];
      // A deferred photo gallery alone does not invalidate current price facts.
      if (hasVerifiedPlannerFacts(venue)) {
        verified[position] = venue;
        continue;
      }
      const profile = await loadProfile(venue.id);
      if (signal.aborted) break;
      if (!profile || profile.id !== venue.id) continue;
      // Never retain an old price/rating/coordinate when the live profile
      // explicitly says that fact is unavailable.
      if (!profile.price || profile.rating == null || profile.latitude == null || profile.longitude == null) continue;
      const hydrated = hydrateVenueDetails(venue, profile);
      if (!hydrated || !hasVerifiedPlannerFacts(hydrated)) continue;
      const classification = classifyGooglePlace({
        primaryType: profile.primaryType, type: profile.primaryType, name: profile.name ?? venue.name,
      });
      const tags = new Set<DiscoveryCategory>(classification.categories);
      for (const fact of profile.highlights ?? []) {
        if (fact.key === 'breakfast') tags.add('Breakfast');
        if (fact.key === 'coffee') tags.add('Coffee');
        if (fact.key === 'cocktails') tags.add('Drinks');
      }
      const primaryType = profile.primaryType.toLowerCase();
      const category: Venue['category'] = /coffee|caf[eé]|bakery/.test(primaryType)
        ? 'Coffee' : /pub/.test(primaryType) ? 'Pub' : /bar/.test(primaryType) && !/restaurant/.test(primaryType) ? 'Bar' : 'Restaurant';
      if (category === 'Coffee') tags.add('Coffee');
      if (category === 'Bar') { tags.add('Bar'); tags.add('Drinks'); }
      if (category === 'Pub') { tags.add('Pubs'); tags.add('Drinks'); }
      verified[position] = {
        ...hydrated, name: profile.name || hydrated.name, category,
        discoveryCategories: [...tags], detailsDeferred: profile.openNow == null,
      };
    }
  }));
  return signal.aborted ? [] : verified.filter((venue): venue is Venue => venue !== null);
}
