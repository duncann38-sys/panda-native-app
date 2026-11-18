const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;
export function isGooglePlaceVenue(
  venue: { id?: string | null; source?: string | null } | null | undefined,
): boolean {
  return Boolean(venue && venue.source !== 'openstreetmap'
    && typeof venue.id === 'string' && GOOGLE_PLACE_ID_PATTERN.test(venue.id));
}
