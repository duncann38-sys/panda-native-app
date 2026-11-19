import { Linking } from 'react-native';
import { router } from 'expo-router';
import type { Venue } from '@/data/venues';
import { safeVenueUrl, loadOfficialVenueLinks } from './official-venue-links';
import { recordVenueActivity } from './record-venue-activity';
import type { VenueActivitySurface } from './venue-activity';

export type NonHospitalityAction = { kind: 'website' | 'directions' | 'tickets'; label: string; url: string };
export const isNonHospitalityVenue = (venue: Pick<Venue, 'category'>) =>
  venue.category === 'Shop' || venue.category === 'Place of Interest';

export function nonHospitalityActions(venue: Venue): NonHospitalityAction[] {
  if (!isNonHospitalityVenue(venue)) return [];
  const website = safeVenueUrl(venue.website);
  let ticket: string | null = null;
  if (venue.category === 'Place of Interest' && website) {
    const parsed = new URL(website);
    if (/(?:^|[./_-])(?:tickets?|book-a-visit|book-your-visit|admission)(?:[./_?=-]|$)/i.test(parsed.hostname + parsed.pathname))
      ticket = website;
  }
  const explicit = safeVenueUrl(venue.ticketUrl);
  if (venue.category === 'Place of Interest' && explicit && venue.ticketPlaceId === venue.id && venue.ticketUrlVerified === true)
    ticket = explicit;
  const destination = `${venue.name} ${venue.fullAddress || venue.neighborhood}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&destination_place_id=${encodeURIComponent(venue.id)}`;
  return [
    ...(ticket ? [{ kind: 'tickets' as const, label: 'Tickets / Book a visit', url: ticket }] : []),
    { kind: 'website', label: 'Website', url: website || '' },
    { kind: 'directions', label: 'Directions', url: directions },
  ];
}

export async function openNonHospitalityAction(venue: Venue, action: NonHospitalityAction, surface: VenueActivitySurface = 'discovery') {
  if (!isNonHospitalityVenue(venue)) throw new Error('This action is only available for shops and places to visit.');
  const current = nonHospitalityActions(venue).find(item => item.kind === action.kind);
  if (!current) throw new Error('No verified link is available for this action.');
  if (current.kind === 'directions') {
    recordVenueActivity('directions_click', venue, surface);
    router.push({ pathname: '/(tabs)/map', params: { directionsVenueId: venue.id, directionsVenueData: JSON.stringify(venue), directionsReturn: 'back', routeMode: 'walking' } });
    return;
  }
  let url = current.url;
  if (!url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try { url = safeVenueUrl((await loadOfficialVenueLinks(venue.id, controller.signal)).website) || ''; }
    finally { clearTimeout(timer); }
  }
  if (!url) throw new Error('No official website has been verified for this place yet. Directions will take you to its Google listing.');
  await Linking.openURL(url);
}
