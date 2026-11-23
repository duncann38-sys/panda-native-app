import type { Venue } from '@/data/venues';
import { classifyGooglePlace } from '@/data/venue-categories';

type Coordinate = { latitude: number; longitude: number };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function placeCoordinate(
  record: Record<string, unknown>,
  axis: 'latitude' | 'longitude',
): number | undefined {
  const shortKey = axis === 'latitude' ? 'lat' : 'lng';
  const location = record.location && typeof record.location === 'object'
    ? record.location as Record<string, unknown>
    : {};
  const value = number(record[axis] ?? record[shortKey] ?? location[axis] ?? location[shortKey]);
  if (value === undefined) return undefined;
  return Math.abs(value) <= (axis === 'latitude' ? 90 : 180) ? value : undefined;
}

export function normalizeGoogleMapSearchVenue(raw: unknown, origin?: Coordinate | null): Venue | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = text(record.id || record.placeId);
  const name = text(record.name);
  const latitude = placeCoordinate(record, 'latitude');
  const longitude = placeCoordinate(record, 'longitude');
  if (!id || !name || latitude === undefined || longitude === undefined) return null;

  const type = text(record.type || record.primaryType) || 'Venue';
  const primaryType = text(record.primaryType);
  const types = Array.isArray(record.types)
    ? record.types.filter((item): item is string => typeof item === 'string')
    : [];
  const category = classifyGooglePlace({ name, type, primaryType, types }).primary;
  const address = text(record.fullAddress || record.address) || name;
  const suppliedDistance = number(record.distanceMeters);
  const distanceMeters = origin
    ? Math.round(Math.hypot(
      (latitude - origin.latitude) * 111_320,
      (longitude - origin.longitude) * 111_320 * Math.cos(origin.latitude * Math.PI / 180),
    ))
    : suppliedDistance ?? 0;
  const rating = number(record.rating);
  const photoName = text(record.photoName) || undefined;
  const photoAttribution = text(record.photoAttribution);
  const mapsUri = text(record.mapsUri)
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;
  const area = address.split(',').slice(-2, -1)[0]?.trim() || 'Google result';
  const price = text(record.price) || 'Price unavailable';
  const openNow = record.openNow === true;

  return {
    id,
    name,
    neighborhood: area,
    category,
    type,
    distance: distanceMeters > 0
      ? distanceMeters < 1000 ? `${distanceMeters} m` : `${(distanceMeters / 1000).toFixed(1)} km`
      : 'Google result',
    walkingTime: distanceMeters > 0 ? `≈ ${Math.max(1, Math.round(distanceMeters / 80))} min walk` : 'Directions available',
    rating: rating === undefined ? '' : rating.toFixed(1),
    ratingCount: number(record.ratingCount) ?? 0,
    price,
    distanceMeters,
    description: `Google venue result for ${name}.`,
    hours: text(record.todayHours) || 'Live hours unavailable',
    feature: type,
    fullAddress: address,
    latitude,
    longitude,
    source: 'google_places',
    sourceAttribution: 'Google',
    openNow,
    website: text(record.website) || '',
    mapsUri,
    phone: text(record.phone) || '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: photoAttribution ? [photoAttribution] : [],
    ...(photoName ? { photoName } : {}),
    ...(number(record.photoCount) !== undefined ? { photoCount: number(record.photoCount) } : {}),
    ...(typeof record.primaryPhotoPath === 'string' ? { primaryPhotoPath: record.primaryPhotoPath } : {}),
  };
}

export function mergeGoogleMapSearchResults(
  googleResults: Venue[],
  localResults: Venue[],
): Venue[] {
  const seen = new Set<string>();
  return [...googleResults, ...localResults].filter((venue) => {
    if (seen.has(venue.id)) return false;
    seen.add(venue.id);
    return true;
  });
}
