import { generalVenueActionUrl, safeVenuePhone, safeVenueUrl, type OfficialVenueLinks } from './official-venue-links';
import { isGooglePlaceVenue } from './google-place-eligibility';

export type ReservationTarget =
  | { provider: 'opentable' | 'venue' | 'website' | 'phone' | 'maps'; url: string; reason: null; provenance?: 'opentable_directory' }
  | { provider: 'unavailable'; url: null; reason: 'lookup_failed' | 'no_direct_link' | 'invalid_link' };

// Only classify existing, venue-verified links. Never construct a restaurant
// URL from a venue name, Google Place ID, partner number or sandbox Directory.
const OPENTABLE_DOMAINS = [
  'opentable.com', 'opentable.co.uk', 'opentable.ca', 'opentable.com.au',
  'opentable.com.mx', 'opentable.de', 'opentable.es', 'opentable.fr',
  'opentable.ie', 'opentable.it', 'opentable.jp', 'opentable.hk',
  'opentable.sg', 'opentable.ae', 'opentable.nl',
];

function openTableHost(hostname: string): boolean {
  return OPENTABLE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export type ReservationVenueContact = { id?: string; name?: string; website?: unknown; phone?: unknown };

export function getReservationContacts(links: OfficialVenueLinks | null, venue: ReservationVenueContact = {}) {
  const trusted = links?.source === 'official_website' && (!links.placeId || !venue.id || links.placeId === venue.id) ? links : null;
  return {
    website: safeVenueUrl(trusted?.website) ?? safeVenueUrl(venue.website),
    phone: safeVenuePhone(trusted?.phone) ?? safeVenuePhone(venue.phone),
    maps: isGooglePlaceVenue({ id: venue.id ?? '' })
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name || 'Venue')}&query_place_id=${encodeURIComponent(venue.id!)}`
      : null,
  };
}

export function getReservationTarget(links: OfficialVenueLinks | null, venue: ReservationVenueContact = {}): ReservationTarget {
  const trusted = links?.placeId && venue.id && links.placeId !== venue.id ? null : links;
  const booking = verifiedBookingTarget(trusted, venue.id ?? trusted?.placeId);
  if (booking.provider !== 'unavailable') return booking;
  const contacts = getReservationContacts(trusted, venue);
  if (contacts.website) return { provider: 'website', url: contacts.website, reason: null };
  if (contacts.phone) return { provider: 'phone', url: `tel:${contacts.phone}`, reason: null };
  if (contacts.maps) return { provider: 'maps', url: contacts.maps, reason: null };
  return booking;
}

function verifiedBookingTarget(links: OfficialVenueLinks | null, placeId?: string): ReservationTarget {
  if (!links || links.source !== 'official_website' || links.lookupStatus === 'unavailable') {
    return { provider: 'unavailable', url: null, reason: 'lookup_failed' };
  }
  if (links.lookupStatus !== 'verified' || !links.reservationUrl) {
    return { provider: 'unavailable', url: null, reason: 'no_direct_link' };
  }
  const value = generalVenueActionUrl(links.reservationUrl, 'reservation');
  if (!value || value === safeVenueUrl(links.website)) {
    return { provider: 'unavailable', url: null, reason: 'invalid_link' };
  }
  const url = new URL(value);
  if (openTableHost(url.hostname)) {
    if (links.reservationSource === 'opentable_directory') {
      const match = links.openTableMatch;
      if (!match || (placeId && match.placeId !== placeId) || match.environment !== 'production' || !Number.isFinite(match.expiresAt)
        || match.expiresAt <= Date.now() || !Number.isSafeInteger(match.rid) || match.rid <= 0) {
        return { provider: 'unavailable', url: null, reason: 'invalid_link' };
      }
      const rid = url.searchParams.get('rid') ?? url.pathname.match(/^\/restaurant\/profile\/(\d+)\/?$/i)?.[1];
      if (rid !== undefined && rid !== null && rid !== String(match.rid)) {
        return { provider: 'unavailable', url: null, reason: 'invalid_link' };
      }
    }
    const profile = /^\/r\/[a-z0-9][a-z0-9-]+\/?$/i.test(url.pathname)
      || /^\/restaurant\/profile\/[1-9]\d*\/?$/i.test(url.pathname);
    const reservation = /^\/(?:booking\/)?restref\/client\/?$/i.test(url.pathname)
      && /^[1-9]\d*$/.test(url.searchParams.get('rid') ?? '');
    if (url.protocol !== 'https:' || (!profile && !reservation)) {
      return { provider: 'unavailable', url: null, reason: 'invalid_link' };
    }
    return { provider: 'opentable', url: value, reason: null,
      ...(links.reservationSource === 'opentable_directory' ? { provenance: 'opentable_directory' as const } : {}) };
  }
  // A lookalike domain must never be presented as an OpenTable integration.
  if (url.hostname.includes('opentable') || links.reservationSource === 'opentable_directory') {
    return { provider: 'unavailable', url: null, reason: 'invalid_link' };
  }
  return { provider: 'venue', url: value, reason: null };
}
