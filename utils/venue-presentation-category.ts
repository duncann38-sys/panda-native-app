import { classifyGooglePlace } from '../data/venue-categories';
import type { Venue } from '../data/venues';
export function venuePresentationCategory(venue: Pick<Venue, 'category'> & Partial<Pick<Venue, 'name' | 'type'>>) {
  const detected = classifyGooglePlace({ name: venue.name || '', type: venue.type || '' }).primary;
  return detected === 'Shop' || detected === 'Place of Interest' ? detected : venue.category;
}
