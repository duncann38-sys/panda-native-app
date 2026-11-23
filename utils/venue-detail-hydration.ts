import type { Venue } from '@/data/venues';
import { venuePresentationCategory } from './venue-presentation-category';

export type DeferredVenueProfile = {
  id: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  primaryType: string;
  price?: string;
  todayHours?: string | null;
  phone?: string | null;
  website: string | null;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
  photoNames?: Array<{ name: string; attribution: string }>;
};

// Enrich the opened card only. Do not replace paid placement or owner metadata.
export function hydrateVenueDetails(venue: Venue | undefined, profile: DeferredVenueProfile | null): Venue | undefined {
  if (!venue) return venue;
  if (!profile || profile.id !== venue.id) return { ...venue, category: venuePresentationCategory(venue) };
  const photos = profile.photoNames?.filter(photo => Boolean(photo.name));
  return {
    ...venue,
    rating: profile.rating == null ? venue.rating : profile.rating.toFixed(1),
    ratingCount: profile.ratingCount ?? venue.ratingCount,
    fullAddress: profile.address || venue.fullAddress,
    type: profile.primaryType || venue.type,
    category: venuePresentationCategory({ ...venue, type: profile.primaryType || venue.type }),
    price: (profile.price || venue.price) as Venue['price'],
    hours: profile.todayHours || venue.hours,
    openNow: profile.openNow ?? venue.openNow,
    phone: profile.phone || venue.phone,
    website: profile.website || venue.website,
    mapsUri: profile.googleMapsUrl || venue.mapsUri,
    latitude: profile.latitude ?? venue.latitude,
    longitude: profile.longitude ?? venue.longitude,
    ...(photos ? {
      photoNames: photos,
      photoName: photos[0]?.name,
      photoCount: photos.length,
      photoAttributions: photos.map(photo => photo.attribution),
    } : {}),
  };
}

export function fullCardOpenStatus(venue: Venue, profile: DeferredVenueProfile | null): boolean | null {
  if (profile?.id === venue.id) return profile.openNow;
  return venue.detailsDeferred ? null : venue.openNow;
}
