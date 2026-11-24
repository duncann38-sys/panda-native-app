import type { Venue } from '@/data/venues';

export type BangingFallbackOrigin = {
  latitude: number;
  longitude: number;
};

const BANGING_OFFLINE_RADIUS_METRES = 50_000;
const LONDON_CURATED_CENTRE = { latitude: 51.5074, longitude: -0.1278 };
const LONDON_CURATED_RADIUS_METRES = 45_000;
const BANGING_CATEGORIES = new Set<Venue['category']>(['Restaurant']);
const CURATED_BANGING_CATEGORIES = new Set<Venue['category']>(['Restaurant', 'Bar', 'Pub']);
const HIGH_END_TERMS = /\b(fine dining|michelin|luxury|hotel|rooftop|cocktail|wine bar|tasting menu|destination|upscale)\b/i;
const FAST_CASUAL_OR_TAKEAWAY = /\b(fast[- ]?food|quick service|take[- ]?away|meal takeaway|drive[- ]?thru|food court)\b/i;
const KNOWN_CHAINS = /\b(mcdonald'?s|kfc|burger king|subway|domino'?s|pizza hut|pizza ?express|zizzi|prezzo|ask italian|bella italia|frankie and benny'?s|tgi fridays|wagamama|nando'?s|five guys|taco bell|leon|itsu|greggs|pret a manger|costa coffee|starbucks|shake shack|papa john'?s|yo!? sushi)\b/i;

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

function estimatedTransitMinutes(distanceMeters: number) {
  const estimate = Math.ceil(15 + (distanceMeters / 1_000) * 2.1);
  return estimate > 0 && estimate < 120 ? estimate : null;
}

function validOrigin(origin: BangingFallbackOrigin | null | undefined): origin is BangingFallbackOrigin {
  return Boolean(origin
    && validCoordinate(origin.latitude, 90)
    && validCoordinate(origin.longitude, 180));
}

function venueIdentity(venue: Venue) {
  return venue.name + ' ' + venue.type + ' ' + venue.category;
}

function hasHighEndSignal(venue: Venue) {
  const priceLevel = (String(venue.price || '').match(/£/g) || []).length;
  return Boolean(venue.luxurySource)
    || priceLevel >= 3
    || HIGH_END_TERMS.test(venueIdentity(venue));
}

function isExcludedCasualOrChain(venue: Venue) {
  const identity = venueIdentity(venue);
  return FAST_CASUAL_OR_TAKEAWAY.test(identity) || KNOWN_CHAINS.test(venue.name);
}

function isLiveFallbackCandidate(venue: Venue, origin: BangingFallbackOrigin) {
  const rating = Number.parseFloat(venue.rating);
  if (!venue.id || !venue.name || venue.source === 'openstreetmap' || venue.id.startsWith('osm:')) return false;
  if (!BANGING_CATEGORIES.has(venue.category) || !Number.isFinite(rating) || rating < 4.5 || rating > 5) return false;
  if (!hasHighEndSignal(venue) || isExcludedCasualOrChain(venue)) return false;
  if (!validCoordinate(venue.latitude, 90) || !validCoordinate(venue.longitude, 180)) return false;
  const distance = metresBetween(origin, { latitude: venue.latitude, longitude: venue.longitude });
  return distance <= BANGING_OFFLINE_RADIUS_METRES && estimatedTransitMinutes(distance) !== null;
}

export function isCuratedNameOnlyBangingFallback(venue: Venue) {
  return venue.bangingFallback === true
    && venue.bangingFallbackSource === 'curated'
    && venue.banging === true
    && venue.premium !== true
    && venue.promoted !== true
    && CURATED_BANGING_CATEGORIES.has(venue.category)
    && Boolean(venue.id && venue.name)
    && !validCoordinate(venue.latitude, 90)
    && !validCoordinate(venue.longitude, 180)
    && venue.rating === ''
    && venue.price === '';
}

export function isBangingFallbackVenue(venue: Venue) {
  if (isCuratedNameOnlyBangingFallback(venue)) return true;
  const rating = Number.parseFloat(venue.rating);
  return venue.bangingFallback === true
    && venue.bangingFallbackSource !== 'curated'
    && venue.banging === true
    && venue.premium !== true
    && venue.promoted !== true
    && Boolean(venue.id && venue.name)
    && BANGING_CATEGORIES.has(venue.category)
    && Number.isFinite(rating) && rating >= 4.5 && rating <= 5
    && hasHighEndSignal(venue)
    && !isExcludedCasualOrChain(venue)
    && validCoordinate(venue.latitude, 90)
    && validCoordinate(venue.longitude, 180)
    && Number.isFinite(venue.bangingTransitMinutes)
    && Number(venue.bangingTransitMinutes) > 0
    && Number(venue.bangingTransitMinutes) < 120;
}

function safeCuratedNameSeed(venue: Venue): Venue {
  return {
    ...venue,
    neighborhood: '',
    distance: '',
    walkingTime: 'Travel details unavailable',
    distanceMeters: 0,
    rating: '',
    ratingCount: 0,
    price: '',
    description: '',
    hours: '',
    feature: '',
    fullAddress: '',
    latitude: undefined,
    longitude: undefined,
    source: undefined,
    sourceAttribution: undefined,
    openNow: false,
    cached: true,
    website: '',
    phone: '',
    ticketUrl: undefined,
    ticketUrlVerified: undefined,
    ticketPlaceId: undefined,
    officialVisitInfo: undefined,
    premium: false,
    banging: true,
    promoted: false,
    luxurySource: undefined,
    bangingTransitMinutes: undefined,
    bangingVerifiedAt: undefined,
    bangingTransitEstimated: false,
    bangingFallback: true,
    bangingFallbackSource: 'curated',
    detailsDeferred: true,
    photoAttributions: [],
    photoName: undefined,
    photoCount: 0,
    primaryPhotoPath: undefined,
    photoNames: [],
    photoUris: [],
    openingSourceName: undefined,
    openingSourceUrl: undefined,
    openingDate: undefined,
    openingReportedAt: undefined,
    openingDesignation: undefined,
    openingEvidence: undefined,
  };
}

/** APK102's name-only London list is used only when the live Google path is unavailable. */
export function buildBangingCuratedNameFallback(
  curatedSeeds: Venue[],
  origin: BangingFallbackOrigin | null | undefined,
  excludedIds: ReadonlySet<string> = new Set(),
): Venue[] {
  if (!validOrigin(origin)
      || metresBetween(origin, LONDON_CURATED_CENTRE) > LONDON_CURATED_RADIUS_METRES) return [];
  const seen = new Set<string>();
  return curatedSeeds.flatMap(venue => {
    if (!venue.id || excludedIds.has(venue.id) || seen.has(venue.id)) return [];
    seen.add(venue.id);
    if (!venue.banging || venue.premium || venue.promoted
        || !CURATED_BANGING_CATEGORIES.has(venue.category)
        || isExcludedCasualOrChain(venue)) return [];
    return [safeCuratedNameSeed(venue)];
  });
}

/** Coordinates-backed candidates are strictly gated and remain below live/stored rated results. */
export function buildBangingFallbackCandidates(
  discovery: Venue[],
  origin: BangingFallbackOrigin | null | undefined,
  excludedIds: ReadonlySet<string> = new Set(),
): Venue[] {
  if (!validOrigin(origin)) return [];
  const candidates = new Map<string, Venue>();
  for (const venue of discovery) {
    if (excludedIds.has(venue.id) || venue.premium || venue.promoted) continue;
    if (!isLiveFallbackCandidate(venue, origin)) continue;
    const distanceMeters = metresBetween(origin, { latitude: venue.latitude!, longitude: venue.longitude! });
    const estimatedMinutes = estimatedTransitMinutes(distanceMeters);
    if (estimatedMinutes === null) continue;
    candidates.set(venue.id, {
      ...venue,
      premium: false,
      banging: true,
      promoted: false,
      bangingTransitMinutes: estimatedMinutes,
      bangingVerifiedAt: undefined,
      bangingTransitEstimated: true,
      walkingTime: '~' + estimatedMinutes + ' min estimated reach',
      bangingFallback: true,
      bangingFallbackSource: 'nearby',
    });
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
