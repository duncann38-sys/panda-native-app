import { generalVenueActionUrl, safeVenueUrl, type ReservationLinks } from './official-venue-links';

export type ReservationTarget =
  | { provider: 'opentable' | 'venue'; url: string; reason: null; provenance?: 'opentable_directory' }
  | { provider: 'unavailable'; url: null; reason: 'lookup_failed' | 'no_direct_link' | 'invalid_link' };

const OPENTABLE_DOMAINS = [
  'opentable.com', 'opentable.co.uk', 'opentable.ca', 'opentable.com.au',
  'opentable.com.mx', 'opentable.de', 'opentable.es', 'opentable.fr',
  'opentable.ie', 'opentable.it', 'opentable.jp', 'opentable.hk',
  'opentable.sg', 'opentable.ae', 'opentable.nl',
];

export function getReservationTarget(links: ReservationLinks | null): ReservationTarget {
  if (!links || links.source !== 'official_website' || links.lookupStatus === 'unavailable') {
    return { provider: 'unavailable', url: null, reason: 'lookup_failed' };
  }
  if (links.lookupStatus !== 'verified' || !links.reservationUrl) {
    return { provider: 'unavailable', url: null, reason: 'no_direct_link' };
  }
  const value = safeVenueUrl(generalVenueActionUrl(links.reservationUrl, 'reservation'));
  if (!value || value === safeVenueUrl(links.website)) {
    return { provider: 'unavailable', url: null, reason: 'invalid_link' };
  }
  const url = new URL(value);
  if (OPENTABLE_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    if (links.reservationSource === 'opentable_directory') {
      const match = links.openTableMatch;
      if (!match || match.environment !== 'production' || !Number.isFinite(match.expiresAt)
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
  if (url.hostname.includes('opentable') || links.reservationSource === 'opentable_directory') {
    return { provider: 'unavailable', url: null, reason: 'invalid_link' };
  }
  return { provider: 'venue', url: value, reason: null };
}
