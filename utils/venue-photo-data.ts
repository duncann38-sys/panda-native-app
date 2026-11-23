import type { Venue } from '@/data/venues';

export type SafeVenuePhotoData = {
  photoAttributions: string[];
  photoNames: NonNullable<Venue['photoNames']>;
  photoUris: NonNullable<Venue['photoUris']>;
  photoCount: number;
  photoName?: string;
  primaryPhotoPath?: string;
};

const MAX_VENUE_PHOTOS = 10;

export function safeVenuePhotoData(venue: Partial<Venue>): SafeVenuePhotoData {
  const photoAttributions = Array.isArray(venue.photoAttributions)
    ? venue.photoAttributions.filter((value): value is string => typeof value === 'string')
    : [];
  const photoNames = Array.isArray(venue.photoNames)
    ? venue.photoNames.filter((photo): photo is NonNullable<Venue['photoNames']>[number] => (
        Boolean(photo)
        && typeof photo === 'object'
        && typeof photo.name === 'string'
        && typeof photo.attribution === 'string'
      ))
    : [];
  const photoUris = Array.isArray(venue.photoUris)
    ? venue.photoUris.filter((photo): photo is NonNullable<Venue['photoUris']>[number] => (
        Boolean(photo)
        && typeof photo === 'object'
        && typeof photo.uri === 'string'
        && photo.uri.length > 0
      )).map(photo => ({
        uri: photo.uri,
        attribution: typeof photo.attribution === 'string' ? photo.attribution : '',
      }))
    : [];

  return {
    photoAttributions,
    photoNames,
    photoUris,
    photoCount: Number.isFinite(venue.photoCount)
      ? Math.max(0, Math.floor(venue.photoCount!))
      : 0,
    photoName: typeof venue.photoName === 'string' ? venue.photoName : undefined,
    primaryPhotoPath: typeof venue.primaryPhotoPath === 'string' ? venue.primaryPhotoPath : undefined,
  };
}

export function safeVenuePhotoLimit(data: SafeVenuePhotoData): number {
  const knownPhotoCount = Math.max(
    data.photoCount,
    data.photoNames.length,
    data.photoUris.length,
    data.photoAttributions.length,
    data.photoName ? 1 : 0,
    data.primaryPhotoPath ? 1 : 0,
  );
  return Math.min(MAX_VENUE_PHOTOS, knownPhotoCount);
}
