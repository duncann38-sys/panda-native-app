import type { DiscoveryCategory } from '@/data/venue-categories';
import type { Venue, VenueCategory } from '@/data/venues';

export type MapCoordinate = { latitude: number; longitude: number };

const VENUE_CATEGORIES = new Set<VenueCategory>([
  'Restaurant',
  'Bar',
  'Coffee',
  'Pub',
  'Shop',
  'Place of Interest',
]);

const DISCOVERY_CATEGORIES = new Set<DiscoveryCategory>([
  'Indian',
  'Italian',
  'Chinese',
  'Spanish',
  'French',
  'British',
  'Japanese',
  'Mexican',
  'Turkish',
  'American',
  'Meat',
  'Bar',
  'Lebanese',
  'Thai',
  'Chicken',
  'Pizza',
  'Burgers',
  'Coffee',
  'Breakfast',
  'Brunch',
  'Lunch',
  'Bottomless',
  'Pubs',
  'Dinner',
  'Drinks',
  'Sports',
  'Live Music',
  'Nightlife',
  'Shops',
  'Places of Interest',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function finiteNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeMapCoordinate(value: unknown): MapCoordinate | null {
  const item = record(value);
  if (!item) return null;
  const latitude = finiteNumberOrUndefined(item.latitude ?? item.lat);
  const longitude = finiteNumberOrUndefined(item.longitude ?? item.lng);
  if (
    latitude === undefined
    || longitude === undefined
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) return null;
  return { latitude, longitude };
}

function safeStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : [];
}

function safePhotoNames(value: unknown): NonNullable<Venue['photoNames']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const photo = record(item);
    const name = text(photo?.name);
    if (!name) return [];
    return [{ name, attribution: text(photo?.attribution) }];
  });
}

function safePhotoUris(value: unknown): NonNullable<Venue['photoUris']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const photo = record(item);
    const uri = text(photo?.uri);
    return uri ? [{ uri, attribution: text(photo?.attribution) }] : [];
  });
}

function safeVisitInfo(value: unknown): Venue['officialVisitInfo'] {
  const item = record(value);
  const placeId = text(item?.placeId);
  const sourceUrl = text(item?.sourceUrl);
  if (!item || !placeId || !sourceUrl) return undefined;
  const admission = record(item.admission);
  const admissionKind = admission?.kind;
  const safeAdmission: { kind: 'free' | 'priced'; text: string } | null = admission
    && (admissionKind === 'free' || admissionKind === 'priced')
    && text(admission.text)
    ? { kind: admissionKind as 'free' | 'priced', text: text(admission.text) }
    : null;
  return {
    placeId,
    sourceUrl,
    ticketsUrl: typeof item.ticketsUrl === 'string' ? item.ticketsUrl : null,
    diningUrl: typeof item.diningUrl === 'string' ? item.diningUrl : null,
    admission: safeAdmission,
  };
}

function safeDiscoveryCategories(value: unknown): DiscoveryCategory[] {
  return safeStrings(value).filter(
    (item): item is DiscoveryCategory => DISCOVERY_CATEGORIES.has(item as DiscoveryCategory),
  );
}

function normalizeVenue(value: unknown, allowMissingLocation: boolean): Venue | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.id);
  const name = text(item.name);
  const coordinate = normalizeMapCoordinate(item);
  const distanceMeters = finiteNumberOrUndefined(item.distanceMeters);
  if (
    !id
    || !name
    || (!allowMissingLocation && !coordinate)
    || (!allowMissingLocation && (distanceMeters === undefined || distanceMeters < 0))
  ) return null;

  const categoryValue = text(item.category) as VenueCategory;
  const category = VENUE_CATEGORIES.has(categoryValue) ? categoryValue : 'Restaurant';
  const ratingValue = typeof item.rating === 'number'
    ? finiteNumberOrUndefined(item.rating)?.toFixed(1) ?? ''
    : text(item.rating);
  const source = item.source === 'google_places' || item.source === 'openstreetmap'
    ? item.source
    : undefined;
  const photoNames = safePhotoNames(item.photoNames);
  const photoUris = safePhotoUris(item.photoUris);
  const photoAttributions = safeStrings(item.photoAttributions);
  const photoCount = finiteNumberOrUndefined(item.photoCount);
  const bangingTransitMinutes = finiteNumberOrUndefined(item.bangingTransitMinutes);
  const bangingVerifiedAt = finiteNumberOrUndefined(item.bangingVerifiedAt);

  return {
    id,
    name,
    neighborhood: text(item.neighborhood),
    category,
    type: text(item.type) || category,
    distance: text(item.distance),
    walkingTime: text(item.walkingTime),
    rating: ratingValue,
    ratingCount: Math.max(0, finiteNumberOrUndefined(item.ratingCount) ?? 0),
    price: text(item.price),
    distanceMeters: distanceMeters !== undefined && distanceMeters >= 0 ? distanceMeters : 0,
    description: text(item.description),
    hours: text(item.hours),
    feature: text(item.feature),
    fullAddress: text(item.fullAddress) || text(item.address) || (allowMissingLocation ? '' : name),
    ...(coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : {}),
    source,
    sourceAttribution: text(item.sourceAttribution) || undefined,
    openNow: item.openNow === true,
    cached: item.cached === true,
    website: text(item.website),
    ticketUrl: text(item.ticketUrl) || undefined,
    ticketUrlVerified: item.ticketUrlVerified === true,
    ticketPlaceId: text(item.ticketPlaceId) || undefined,
    officialVisitInfo: safeVisitInfo(item.officialVisitInfo),
    mapsUri: text(item.mapsUri),
    phone: text(item.phone),
    premium: item.premium === true,
    banging: item.banging === true,
    promoted: item.promoted === true,
    luxurySource: text(item.luxurySource) || undefined,
    ...(bangingTransitMinutes !== undefined ? { bangingTransitMinutes } : {}),
    ...(bangingVerifiedAt !== undefined ? { bangingVerifiedAt } : {}),
    bangingFallback: item.bangingFallback === true,
    photoAttributions,
    photoName: text(item.photoName) || undefined,
    photoCount: photoCount === undefined ? undefined : Math.max(0, Math.min(10, photoCount)),
    primaryPhotoPath: text(item.primaryPhotoPath) || undefined,
    photoNames,
    photoUris,
    detailsDeferred: item.detailsDeferred === true,
    discoveryCategories: safeDiscoveryCategories(item.discoveryCategories),
    openingSourceName: text(item.openingSourceName) || undefined,
    openingSourceUrl: text(item.openingSourceUrl) || undefined,
    openingDate: text(item.openingDate) || undefined,
    openingReportedAt: text(item.openingReportedAt) || undefined,
    openingDesignation: text(item.openingDesignation) || undefined,
    openingEvidence: text(item.openingEvidence) || undefined,
  };
}

export function normalizeDiscoveryVenue(value: unknown): Venue | null {
  return normalizeVenue(value, false);
}

export function normalizeBangingVenueList(value: unknown): Venue[] {
  if (!Array.isArray(value)) return [];
  const venues: Venue[] = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, 500)) {
    const item = record(candidate);
    if (item?.banging !== true) continue;
    const venue = normalizeVenue(item, true);
    if (!venue || seen.has(venue.id)) continue;
    seen.add(venue.id);
    venues.push(venue);
  }
  return venues;
}

export function normalizeDiscoveryVenueList(value: unknown): Venue[] {
  if (!Array.isArray(value)) return [];
  const venues: Venue[] = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, 500)) {
    const venue = normalizeDiscoveryVenue(candidate);
    if (!venue || seen.has(venue.id)) continue;
    seen.add(venue.id);
    venues.push(venue);
  }
  return venues;
}
