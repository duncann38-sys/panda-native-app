import { Linking } from 'react-native';
import { router } from 'expo-router';
import type { Venue } from '@/data/venues';
import { safeVenueUrl, loadOfficialVenueLinks } from './official-venue-links';
import { recordVenueActivity } from './record-venue-activity';
import type { VenueActivitySurface } from './venue-activity';
import { venuePresentationCategory } from './venue-presentation-category';
import { PANDA_RUNTIME_API } from '@/constants/services';

export type NonHospitalityAction = { kind: 'website' | 'directions' | 'transit' | 'tickets' | 'dining'; label: string; url: string };
export const isNonHospitalityVenue = (venue: Pick<Venue, 'category'> & Partial<Pick<Venue, 'name' | 'type'>>) =>
  ['Shop', 'Place of Interest'].includes(venuePresentationCategory(venue));
export function verifiedVisitInfo(venue: Venue) {
  const info = venue.officialVisitInfo;
  if (!info || info.placeId !== venue.id || !safeVenueUrl(info.sourceUrl) || !safeVenueUrl(venue.website)) return null;
  const host = new URL(venue.website).hostname.replace(/^www\./, '');
  const sourceHost = new URL(info.sourceUrl).hostname.replace(/^www\./, '');
  return sourceHost === host || sourceHost.endsWith('.' + host) ? info : null;
}
export function admissionLabel(venue: Venue) {
  if (venuePresentationCategory(venue) !== 'Place of Interest') return null;
  const info = verifiedVisitInfo(venue)?.admission;
  return info && ['free', 'priced'].includes(info.kind) && typeof info.text === 'string' && info.text.trim()
    ? `Entry: ${info.text.trim().slice(0, 240)}` : 'Entry fee: Check official website';
}
function visitUrl(venue: Venue, kind: 'ticketsUrl' | 'diningUrl') {
  const info = verifiedVisitInfo(venue), url = safeVenueUrl(info?.[kind]);
  if (!info || !url) return null;
  const host = new URL(info.sourceUrl).hostname.replace(/^www\./, '');
  const target = new URL(url).hostname.replace(/^www\./, '');
  return target === host || target.endsWith('.' + host) ? url : null;
}
export async function loadVisitInformation(venue: Venue, signal: AbortSignal): Promise<Venue> {
  const response = await fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/links?intent=visit`, {
    headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('Official visitor information is unavailable. Please check the website.');
  const data = await response.json();
  if (data.placeId !== venue.id || data.source !== 'official_website') throw new Error('Visitor information could not be matched to this place.');
  return { ...venue, website: safeVenueUrl(data.website) || venue.website,
    officialVisitInfo: data.visitInfo && typeof data.visitInfo.sourceUrl === 'string'
      ? { ...data.visitInfo, placeId: venue.id } : undefined };
}

export function nonHospitalityActions(venue: Venue): NonHospitalityAction[] {
  if (!isNonHospitalityVenue(venue)) return [];
  const website = safeVenueUrl(venue.website);
  // A Google-supplied official website can itself be an explicit ticket/visit page.
  // Never build a ticket URL from the name or substitute a restaurant reservation URL.
  let ticket: string | null = null;
  const category = venuePresentationCategory(venue);
  if (category === 'Place of Interest' && website) {
    const parsed = new URL(website);
    if (/(?:^|[./_-])(?:tickets?|book-a-visit|book-your-visit|admission)(?:[./_?=-]|$)/i.test(parsed.hostname + parsed.pathname))
      ticket = website;
  }
  const explicit = safeVenueUrl(venue.ticketUrl);
  if (category === 'Place of Interest' && explicit && venue.ticketPlaceId === venue.id && venue.ticketUrlVerified === true)
    ticket = explicit;
  ticket = category === 'Place of Interest' ? visitUrl(venue, 'ticketsUrl') || ticket : null;
  const dining = category === 'Place of Interest' ? visitUrl(venue, 'diningUrl') : null;
  const destination = `${venue.name} ${venue.fullAddress || venue.neighborhood}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&destination_place_id=${encodeURIComponent(venue.id)}`;
  return [
    { kind: 'directions', label: 'Directions', url: directions },
    { kind: 'transit', label: 'Transit', url: directions + '&travelmode=transit' },
    { kind: 'website', label: 'Website', url: website || '' },
    ...(ticket ? [{ kind: 'tickets' as const, label: 'Tickets / Book a visit', url: ticket }] : []),
    ...(dining ? [{ kind: 'dining' as const, label: 'Food & drink', url: dining }] : []),
  ];
}

export async function openNonHospitalityAction(venue: Venue, action: NonHospitalityAction, surface: VenueActivitySurface = 'discovery') {
  if (!isNonHospitalityVenue(venue)) throw new Error('This action is only available for shops and places to visit.');
  // Rebuild from the venue, rather than trusting an arbitrary caller-provided URL.
  const current = nonHospitalityActions(venue).find(item => item.kind === action.kind);
  if (!current) throw new Error('No verified link is available for this action.');
  if (current.kind === 'directions' || current.kind === 'transit') {
    recordVenueActivity('directions_click', venue, surface);
    router.push({ pathname: '/(tabs)/map', params: { directionsVenueId: venue.id, directionsVenueData: JSON.stringify(venue), directionsReturn: 'back', routeMode: current.kind === 'transit' ? 'transit' : 'walking' } });
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
  // Website/ticket handoffs are not restaurant bookings or confirmed ticket purchases.
  await Linking.openURL(url);
}
