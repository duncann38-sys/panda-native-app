import { PANDA_PRODUCTION_API } from '@/constants/services';
import type { Venue } from '@/data/venues';
import { distanceBetween } from './venue-actions';

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
const sessionSeed = Math.floor(Math.random() * 1000000);
let activeTiers: Record<string, Placement['tier']> = {};
export function getPartnerTier(placeId: string) { return activeTiers[placeId]; }

function cohort(pool: Placement[]) {
  if (pool.length <= 10) return pool;
  const group = (sessionSeed + Math.floor(Date.now() / 86400000)) % Math.ceil(pool.length / 10);
  return Array.from({ length: 10 }, (_, index) => pool[(group * 10 + index) % pool.length]);
}

export async function loadPartnerVenues(
  origin: { latitude: number; longitude: number },
  signal: AbortSignal,
) {
  const response = await fetch('https://panda-partners-api.vercel.app/api/public/sponsored-venues', { signal });
  if (!response.ok) throw new Error('Current partner placements unavailable');
  const body = await response.json() as { venues?: Placement[] };
  const placements = (body.venues ?? []).filter(placement => placement.place_id &&
    ['banging', 'discovery'].includes(placement.tier));
  const tiers = Object.fromEntries(placements.map(placement => [placement.place_id, placement.tier]));
  activeTiers = tiers;
  const selected = [...cohort(placements.filter(item => item.tier === 'banging')),
    ...cohort(placements.filter(item => item.tier === 'discovery'))];
  const venues: Venue[] = [];
  // Resolve a bounded cohort, never every paid venue, with at most three requests at once.
  for (let offset = 0; offset < selected.length && !signal.aborted; offset += 3) {
    await Promise.all(selected.slice(offset, offset + 3).map(async placement => {
      try {
        let profile = profileCache.get(placement.place_id)?.profile;
        if (!profile || (profileCache.get(placement.place_id)?.expires ?? 0) <= Date.now()) {
          const result = await fetch(`${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(placement.place_id)}/profile`, { signal });
          if (!result.ok) return;
          profile = await result.json() as Profile;
          profileCache.set(placement.place_id, { expires: Date.now() + 3 * 60 * 60 * 1000, profile });
        }
        if (profile.id !== placement.place_id || !Number.isFinite(profile.latitude) ||
          !Number.isFinite(profile.longitude)) return;
        const distance = distanceBetween(origin, profile);
        if (distance === null) return;
        const category = /pub/i.test(profile.primaryType) ? 'Pub' : /bar|nightclub/i.test(profile.primaryType)
          ? 'Bar' : /cafe|coffee|bakery/i.test(profile.primaryType) ? 'Coffee' : 'Restaurant';
        venues.push({
          id: profile.id, name: profile.name, neighborhood: profile.address,
          category, type: profile.primaryType, distance: `${(distance / 1000).toFixed(1)} km away`,
          distanceMeters: distance, walkingTime: 'Walking directions',
          rating: profile.rating?.toFixed(1) || '', ratingCount: profile.ratingCount || 0,
          price: profile.price || '', description: profile.primaryType, hours: profile.todayHours || 'Hours unavailable',
          feature: profile.highlights?.[0]?.label || profile.primaryType, fullAddress: profile.address,
          openNow: profile.openNow === true, website: profile.website || '',
          mapsUri: profile.googleMapsUrl, phone: profile.phone || '',
          latitude: profile.latitude!, longitude: profile.longitude!,
          promoted: true, banging: placement.tier === 'banging', premium: placement.tier === 'banging',
          photoNames: profile.photoNames, photoName: profile.photoNames?.[0]?.name,
          photoCount: profile.photoNames?.length, photoAttributions: profile.photoNames?.map(photo => photo.attribution) || [],
        });
      } catch (error) { if (signal.aborted) throw error; }
    }));
  }
  return { tiers, venues };
}
