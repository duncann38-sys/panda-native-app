import type { Venue } from '@/data/venues';
import { isGooglePlaceVenue } from './google-place-eligibility';

const textFields = [
  'id', 'name', 'neighborhood', 'type', 'distance', 'walkingTime', 'rating',
  'price', 'description', 'hours', 'feature', 'fullAddress', 'website', 'mapsUri', 'phone',
] as const;
const categories = new Set(['Restaurant', 'Bar', 'Coffee', 'Pub', 'Shop', 'Place of Interest']);

/** Restore the exact in-app route snapshot, never substitute bundled venues. */
export function restorePlannerSnapshot(raw: string | undefined, ids: string[]): Venue[] | null {
  if (!raw || raw.length > 200_000 || ids.length < 2 || ids.length > 3 || new Set(ids).size !== ids.length) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== ids.length) return null;
    const valid = parsed.every((venue) =>
      venue && typeof venue === 'object'
      && textFields.every((key) => typeof venue[key] === 'string')
      && isGooglePlaceVenue(venue)
      && categories.has(venue.category)
      && ['ratingCount', 'distanceMeters'].every((key) => typeof venue[key] === 'number' && Number.isFinite(venue[key]) && venue[key] >= 0)
      && ['openNow', 'premium', 'banging', 'promoted'].every((key) => typeof venue[key] === 'boolean')
      && Array.isArray(venue.photoAttributions) && venue.photoAttributions.every((item: unknown) => typeof item === 'string')
      && typeof venue.latitude === 'number' && Number.isFinite(venue.latitude) && Math.abs(venue.latitude) <= 90
      && typeof venue.longitude === 'number' && Number.isFinite(venue.longitude) && Math.abs(venue.longitude) <= 180,
    );
    if (!valid || new Set(parsed.map((venue) => venue.id)).size !== ids.length) return null;
    const ordered = ids.map((id) => parsed.find((venue) => venue.id === id));
    return ordered.every(Boolean) ? ordered as Venue[] : null;
  } catch {
    return null;
  }
}
