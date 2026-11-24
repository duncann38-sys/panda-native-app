import type { Venue } from '@/data/venues';

export type BangingFallbackOrigin = {
  latitude: number;
  longitude: number;
};

export const BANGING_LOCAL_RADIUS_METRES = 25_000;
const BANGING_CATEGORIES = new Set<Venue['category']>(['Restaurant']);
const HIGH_END_TERMS = /\b(fine dining|michelin|luxury|hotel|rooftop|cocktail|wine bar|tasting menu|destination|upscale)\b/i;

function validCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function metresBetween(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(second.latitude - first.latitude);
  const longitude = radians(second.longitude - first.longitude);
  const a = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
      * Math.sin(longitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validOrigin(origin: BangingFallbackOrigin | null | undefined): origin is BangingFallbackOrigin {
  return Boolean(origin
    && validCoordinate(origin.latitude, 90)
    && validCoordinate(origin.longitude, 180));
}

function hasHighEndSignal(venue: Venue) {
  const priceLevel = (venue.price.match(/£/g) || []).length;
  return Boolean(venue.luxurySource)
    || priceLevel >= 3
    || HIGH_END_TERMS.test(`${venue.name} ${venue.type}`);
}

function isLiveFallbackCandidate(venue: Venue, origin: BangingFallbackOrigin) {
  if (!venue.id || !venue.name || venue.source === 'openstreetmap' || venue.id.startsWith('osm:')) return false;
  if (!BANGING_CATEGORIES.has(venue.category) || Number(venue.rating) < 4.5 || !hasHighEndSignal(venue)) return false;
  if (!validCoordinate(venue.latitude, 90) || !validCoordinate(venue.longitude, 180)) return false;
  return metresBetween(origin, { latitude: venue.latitude, longitude: venue.longitude }) <= BANGING_LOCAL_RADIUS_METRES;
}

export function isBangingFallbackVenue(venue: Venue) {
  return venue.bangingFallback === true
    && venue.banging === true
    && venue.premium !== true
    && venue.promoted !== true
    && Boolean(venue.id && venue.name)
    && BANGING_CATEGORIES.has(venue.category);
}

function safeCuratedSeed(venue: Venue, origin: BangingFallbackOrigin): Venue {
  const distanceMeters = metresBetween(origin, {
    latitude: venue.latitude!,
    longitude: venue.longitude!,
  });
  return {
    ...venue,
    neighborhood: '',
    distance: distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`,
    walkingTime: 'Travel details unavailable',
    distanceMeters,
    description: '',
    hours: '',
    feature: '',
    fullAddress: '',
    latitude: venue.latitude,
    longitude: venue.longitude,
    openNow: false,
    cached: true,
    detailsDeferred: true,
    premium: false,
    banging: true,
    promoted: false,
    luxurySource: undefined,
    bangingTransitMinutes: undefined,
    bangingVerifiedAt: undefined,
    photoAttributions: [],
    photoName: undefined,
    photoCount: 0,
    primaryPhotoPath: undefined,
    photoNames: [],
    photoUris: [],
    bangingFallback: true,
  };
}

/**
 * Keep real nearby high-end discovery results visible when the separate Banging
 * directory is unavailable. APK 78's approved curated London IDs are the
 * last-resort name list; their synthetic distances, hours and photos are not
 * carried into the fallback cards.
 */
export function buildBangingFallbackCandidates(
  discovery: Venue[],
  curatedSeeds: Venue[],
  origin: BangingFallbackOrigin | null | undefined,
  excludedIds: ReadonlySet<string> = new Set(),
): Venue[] {
  if (!validOrigin(origin)) return [];
  const candidates = new Map<string, Venue>();
  for (const venue of discovery) {
    if (excludedIds.has(venue.id) || venue.premium || venue.promoted) continue;
    if (!isLiveFallbackCandidate(venue, origin)) continue;
    candidates.set(venue.id, {
      ...venue,
      premium: false,
      banging: true,
      promoted: false,
      bangingTransitMinutes: undefined,
      bangingVerifiedAt: undefined,
      walkingTime: 'Travel details unavailable',
      bangingFallback: true,
    });
  }

  for (const venue of curatedSeeds) {
    if (!venue.id || excludedIds.has(venue.id) || candidates.has(venue.id)) continue;
    if (!venue.banging || venue.premium || venue.promoted || !BANGING_CATEGORIES.has(venue.category)) continue;
    if (Number(venue.rating) < 4.5
      || !validCoordinate(venue.latitude, 90)
      || !validCoordinate(venue.longitude, 180)) continue;
    if (metresBetween(origin, { latitude: venue.latitude, longitude: venue.longitude }) > BANGING_LOCAL_RADIUS_METRES) continue;
    candidates.set(venue.id, safeCuratedSeed(venue, origin));
  }
  return [...candidates.values()];
}

export function mergeBangingOrganicResults(
  primary: Venue[],
  fallback: Venue[],
  targetCount = 40,
): Venue[] {
  const result: Venue[] = [];
  const seen = new Set<string>();
  for (const venue of [...primary, ...fallback]) {
    if (!venue.id || seen.has(venue.id) || venue.premium || venue.promoted) continue;
    seen.add(venue.id);
    result.push(venue);
    if (result.length >= targetCount) break;
  }
  return result;
}
