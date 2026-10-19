import type { Venue, VenueCategory } from '@/data/venues';

export type LiveSavedVenueProfile = {
  id: string;
  name: string;
  address: string;
  primaryType: string;
  rating: number | null;
  ratingCount: number | null;
  price: string | null;
  openNow: boolean | null;
  todayHours: string | null;
  phone: string | null;
  website: string | null;
  editorialSummary: string | null;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
};

export type LiveSavedVenuePhoto = {
  path: string;
  attribution?: string | Array<{ displayName?: string; uri?: string }>;
};

function venueCategory(type: string): VenueCategory {
  const value = type.toLowerCase();
  if (/\bpub\b/.test(value)) return 'Pub';
  if (/\b(bar|nightclub|night club|cocktail)\b/.test(value)) return 'Bar';
  if (/\b(cafe|coffee|tea)\b/.test(value)) return 'Coffee';
  if (/\b(shop|store|retail)\b/.test(value)) return 'Shop';
  if (/\b(museum|park|landmark|tourist|gallery|theatre|theater)\b/.test(value)) return 'Place of Interest';
  return 'Restaurant';
}

function photoAttribution(value: LiveSavedVenuePhoto['attribution'], venueName: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const names = value
      .map((entry) => entry.displayName?.trim())
      .filter((name): name is string => Boolean(name));
    if (names.length) return names.join(', ');
  }
  return venueName;
}

export function buildLiveSavedVenue(
  profile: LiveSavedVenueProfile,
  photos: LiveSavedVenuePhoto[],
  apiBase: string,
): Venue {
  const normalizedApiBase = apiBase.replace(/\/+$/, '');
  const venueType = profile.primaryType || 'Local venue';
  const photoUris = photos
    .filter((photo) => typeof photo.path === 'string' && photo.path.startsWith('/'))
    .slice(0, 10)
    .map((photo) => ({
      uri: `${normalizedApiBase}${photo.path}`,
      attribution: photoAttribution(photo.attribution, profile.name),
    }));

  return {
    id: profile.id,
    name: profile.name,
    neighborhood: 'Saved place',
    category: venueCategory(venueType),
    type: venueType,
    distance: 'Saved',
    walkingTime: '',
    rating: typeof profile.rating === 'number' ? profile.rating.toFixed(1) : '',
    ratingCount: profile.ratingCount ?? 0,
    price: profile.price ?? '',
    distanceMeters: 0,
    description: profile.editorialSummary || venueType,
    hours: profile.todayHours || '',
    feature: venueType,
    fullAddress: profile.address,
    latitude: profile.latitude ?? undefined,
    longitude: profile.longitude ?? undefined,
    source: 'google_places',
    openNow: profile.openNow === true,
    detailsDeferred: profile.openNow === null,
    website: profile.website || '',
    mapsUri: profile.googleMapsUrl,
    phone: profile.phone || '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: photoUris.map((photo) => photo.attribution),
    photoUris,
  };
}
