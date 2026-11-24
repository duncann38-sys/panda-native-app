import { PANDA_PARTNER_ACTIVITY_API, PANDA_PRODUCTION_API } from '@/constants/services';
import type { Venue } from '@/data/venues';
import { distanceBetween } from '@/utils/venue-actions';
import { bangingClock } from '@/utils/banging-rotation';
import { finiteNumberOrUndefined, normalizeMapCoordinate } from '@/utils/discovery-data-safety';
import { minimalPartnerVenue } from '@/utils/partner-venue-fallback';

type Placement = { name: string; place_id: string; tier: 'banging' | 'discovery' };
type Profile = {
  id: string; name: string; address: string; primaryType: string;
  latitude: number | null; longitude: number | null; price: string | null;
  rating: number | null; ratingCount: number | null; openNow: boolean | null;
  todayHours: string | null; phone: string | null; website: string | null;
  googleMapsUrl: string; highlights: Array<{ label: string }>;
  photoNames?: Array<{ name: string; attribution: string }>;
};
const profileCache = new Map<string, { expires: number; profile: Profile }>();
const sessionSeed = Math.floor(Math.random() * 1_000_000);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePlacements(value: unknown): Placement[] {
  const body = record(value);
  if (!Array.isArray(body?.venues)) return [];
  return body.venues.flatMap((candidate) => {
    const item = record(candidate);
    const name = text(item?.name);
    const place_id = text(item?.place_id);
    const tier = item?.tier;
    if (
      !name
      || !place_id
      || place_id.startsWith('place-')
      || (tier !== 'banging' && tier !== 'discovery')
    ) return [];
    return [{ name, place_id, tier }];
  });
}

function normalizeProfile(value: unknown, expectedId: string): Profile | null {
  const item = record(value);
  const id = text(item?.id);
  const coordinate = normalizeMapCoordinate(item);
  if (!item || !id || id !== expectedId || !coordinate) return null;
  const rating = finiteNumberOrUndefined(item.rating);
  const ratingCount = finiteNumberOrUndefined(item.ratingCount);
  const highlights = Array.isArray(item.highlights)
    ? item.highlights.flatMap((candidate) => {
      const label = text(record(candidate)?.label);
      return label ? [{ label }] : [];
    })
    : [];
  const photoNames = Array.isArray(item.photoNames)
    ? item.photoNames.flatMap((candidate) => {
      const photo = record(candidate);
      const name = text(photo?.name);
      return name ? [{ name, attribution: text(photo?.attribution) }] : [];
    })
    : [];
  return {
    id,
    name: text(item.name),
    address: text(item.address),
    primaryType: text(item.primaryType) || 'Restaurant',
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    price: typeof item.price === 'string' ? item.price : null,
    rating: rating ?? null,
    ratingCount: ratingCount ?? null,
    openNow: typeof item.openNow === 'boolean' ? item.openNow : null,
    todayHours: typeof item.todayHours === 'string' ? item.todayHours : null,
    phone: typeof item.phone === 'string' ? item.phone : null,
    website: typeof item.website === 'string' ? item.website : null,
    googleMapsUrl: text(item.googleMapsUrl),
    highlights,
    photoNames,
  };
}

function cohort(pool: Placement[]) {
  if (pool.length <= 10) return pool;
  const clock = bangingClock();
  const day = Math.floor(Date.parse(`${clock.day}T12:00:00Z`) / 86_400_000);
  const group = (sessionSeed + day * 6 + clock.slot) % Math.ceil(pool.length / 10);
  return Array.from({ length: 10 }, (_, index) => pool[(group * 10 + index) % pool.length]);
}

export async function loadPartnerVenues(
  origin: { latitude: number; longitude: number },
  signal: AbortSignal,
) {
  const safeOrigin = normalizeMapCoordinate(origin);
  if (!safeOrigin) return { tiers: {}, venues: [] as Venue[] };
  const response = await fetch(`${PANDA_PARTNER_ACTIVITY_API}/api/public/sponsored-venues`, { signal });
  if (!response.ok) throw new Error('Current partner placements unavailable');
  const body: unknown = await response.json();
  const placements = normalizePlacements(body);
  const tiers = Object.fromEntries(placements.map(placement => [placement.place_id, placement.tier]));
  const locallyRanked = placements.slice().sort((a, b) => {
    const first = profileCache.get(a.place_id)?.profile;
    const second = profileCache.get(b.place_id)?.profile;
    return (first ? distanceBetween(safeOrigin, first) ?? Infinity : Infinity) -
      (second ? distanceBetween(safeOrigin, second) ?? Infinity : Infinity);
  });
  const selected = [
    ...cohort(locallyRanked.filter(item => item.tier === 'banging')),
    ...cohort(locallyRanked.filter(item => item.tier === 'discovery')),
  ];
  const venues: Venue[] = [];
  for (let offset = 0; offset < selected.length && !signal.aborted; offset += 3) {
    await Promise.all(selected.slice(offset, offset + 3).map(async placement => {
      try {
        let profile = profileCache.get(placement.place_id)?.profile;
        if (!profile || (profileCache.get(placement.place_id)?.expires ?? 0) <= Date.now()) {
          const result = await fetch(
            `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(placement.place_id)}/profile`,
            { signal },
          );
          if (result.ok) {
            const parsed: unknown = await result.json();
            const refreshed = normalizeProfile(parsed, placement.place_id);
            if (refreshed) {
              profile = refreshed;
              profileCache.set(placement.place_id, { expires: Date.now() + 3 * 60 * 60 * 1000, profile });
            }
          }
        }
        if (signal.aborted) return;
        const profileCoordinate = normalizeMapCoordinate(profile);
        if (!profile || profile.id !== placement.place_id || !profileCoordinate) {
          venues.push(minimalPartnerVenue(placement));
          return;
        }
        const distance = distanceBetween(safeOrigin, profileCoordinate);
        if (distance === null) {
          venues.push(minimalPartnerVenue(placement));
          return;
        }
        const category: Venue['category'] = /pub/i.test(profile.primaryType) ? 'Pub'
          : /bar|nightclub/i.test(profile.primaryType) ? 'Bar'
            : /cafe|coffee|bakery/i.test(profile.primaryType) ? 'Coffee' : 'Restaurant';
        const photos = profile.photoNames ?? [];
        venues.push({
          id: profile.id,
          name: profile.name || placement.name,
          neighborhood: profile.address,
          category,
          type: profile.primaryType,
          distance: `${(distance / 1000).toFixed(1)} km away`,
          distanceMeters: distance,
          walkingTime: 'Walking directions',
          rating: profile.rating?.toFixed(1) || '',
          ratingCount: profile.ratingCount || 0,
          price: profile.price || '',
          description: profile.primaryType,
          hours: profile.todayHours || 'Hours unavailable',
          feature: profile.highlights?.[0]?.label || profile.primaryType,
          fullAddress: profile.address,
          openNow: profile.openNow === true,
          website: profile.website || '',
          mapsUri: profile.googleMapsUrl,
          phone: profile.phone || '',
          latitude: profileCoordinate.latitude,
          longitude: profileCoordinate.longitude,
          source: 'google_places',
          sourceAttribution: 'Google Places',
          promoted: true,
          banging: placement.tier === 'banging',
          premium: placement.tier === 'banging',
          photoNames: photos,
          photoName: photos[0]?.name,
          photoCount: photos.length,
          photoAttributions: photos.map(photo => photo.attribution),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        venues.push(minimalPartnerVenue(placement));
      }
    }));
  }
  return { tiers, venues };
}
