import { PANDA_RUNTIME_API } from '@/constants/services';
import { isGooglePlaceVenue } from './google-place-eligibility';

export type OfficialVenueLinks = { menuUrl?: string; reservationUrl?: string; website?: string };
export type ReservationLinks = {
  website: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  source: 'official_website';
  lookupStatus: 'verified' | 'no_direct_links' | 'unavailable';
  reservationSource?: 'official_website' | 'opentable_directory';
  openTableMatch?: { placeId: string; rid: number; environment: 'production'; method: string; expiresAt: number };
  openTableLookup?: string;
};
const reservationCache = new Map<string, { expires: number; links: ReservationLinks }>();
const cache = new Map<string, { expires: number; links: OfficialVenueLinks }>();
const pending = new Map<string, Promise<OfficialVenueLinks | null>>();

export function officialPageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host === '::1' || host.startsWith('fc') && host.includes(':')
      || host.startsWith('fd') && host.includes(':') || host.startsWith('fe80:')
      || /^(?:0|10|127|169\.254|192\.168)\./.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
      || /(?:^|\.)google\.[a-z.]+$/.test(host) && /^\/(?:maps|search)/.test(url.pathname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function generalVenueActionUrl(value: unknown, kind: 'menu' | 'reservation'): string | undefined {
  const safe = officialPageUrl(value);
  if (!safe) return undefined;
  let path: string;
  try {
    const url = new URL(safe);
    path = decodeURIComponent(`${url.pathname}${url.search}`).toLowerCase();
  } catch { return undefined; }
  if (kind === 'menu' && /christmas|festive|new.year|valentine|mother.s.day|father.s.day|easter/.test(path)) return undefined;
  if (kind === 'reservation' && /ticket|cinema|movie|film|screening|private.hire|private.event|book.room|hotel.room/.test(path)) return undefined;
  return safe;
}

// Only links identified by Panda's official-site resolver are menu links.
// Never manufacture /menu paths or treat a search result as a restaurant menu.
export function getOfficialVenueLinks(id: string, refresh = false): Promise<OfficialVenueLinks | null> {
  const saved = cache.get(id);
  if (!refresh && saved && saved.expires > Date.now()) return Promise.resolve(saved.links);
  const existing = pending.get(id);
  if (existing) return existing;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  const request = fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(id)}/links`, {
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) throw new Error('Official links unavailable');
    const payload = await response.json();
    if (payload.source !== 'official_website') return null;
    const website = officialPageUrl(payload.website);
    const menuUrl = generalVenueActionUrl(payload.menuUrl, 'menu');
    const reservationUrl = generalVenueActionUrl(payload.reservationUrl, 'reservation');
    const links: OfficialVenueLinks = {
      menuUrl: menuUrl && menuUrl !== website ? menuUrl : undefined,
      reservationUrl: reservationUrl && reservationUrl !== website ? reservationUrl : undefined,
      website,
    };
    // A temporary empty result must not hide a menu for three hours.
    if (links.menuUrl || links.reservationUrl) {
      cache.set(id, { expires: Date.now() + 3 * 60 * 60 * 1000, links });
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
    }
    return links;
  }).catch(() => null).finally(() => {
    clearTimeout(timeout);
    pending.delete(id);
  });
  pending.set(id, request);
  return request;
}

// Keep Build 74's menu resolver and cache unchanged. Reserve is an explicit,
// separately attributed lookup, compatible with both the current API and the
// prepared production-only OpenTable matching response.
export function safeVenueUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const safe = officialPageUrl(value);
  if (!safe) return null;
  const host = new URL(safe).hostname;
  if (/^(?:maps\.|maps\.app\.goo\.gl$)/i.test(host) || host.startsWith('[')) return null;
  return safe;
}

export async function loadOfficialVenueLinks(
  id: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch,
  intent: 'all' | 'reservation' = 'all',
): Promise<ReservationLinks> {
  if (!isGooglePlaceVenue({ id })) throw new Error('A Google venue is required.');
  const key = `${intent}:${id}`;
  const cached = reservationCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.links;
  const response = await fetchImpl(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(id)}/links${intent === 'reservation' ? '?intent=reservation' : ''}`, {
    headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('Official venue links could not be checked.');
  const data = await response.json() as Partial<ReservationLinks>;
  if (data.source !== 'official_website') throw new Error('Official venue links have no verified source.');
  const website = safeVenueUrl(data.website);
  const menu = safeVenueUrl(generalVenueActionUrl(data.menuUrl, 'menu'));
  const reservation = safeVenueUrl(generalVenueActionUrl(data.reservationUrl, 'reservation'));
  const menuUrl = data.lookupStatus === 'unavailable' || menu === website ? null : menu;
  const proof = data.openTableMatch;
  const directoryMatchValid = proof?.placeId === id && proof.environment === 'production'
    && Number.isSafeInteger(proof.rid) && proof.rid > 0 && Number.isFinite(proof.expiresAt)
    && proof.expiresAt > Date.now() && ['name_address_coordinates', 'name_phone_coordinates',
      'name_postcode_number_coordinates', 'name_alias_address_phone_coordinates'].includes(proof.method);
  const reservationUrl = data.lookupStatus === 'unavailable' || reservation === website
    || (data.reservationSource === 'opentable_directory' && !directoryMatchValid) ? null : reservation;
  const links: ReservationLinks = {
    website, menuUrl, reservationUrl, source: 'official_website',
    reservationSource: data.reservationSource === 'opentable_directory' ? 'opentable_directory' : 'official_website',
    ...(directoryMatchValid ? { openTableMatch: proof } : {}),
    ...(typeof data.openTableLookup === 'string' ? { openTableLookup: data.openTableLookup } : {}),
    lookupStatus: data.lookupStatus === 'unavailable' ? 'unavailable' : menuUrl || reservationUrl ? 'verified' : 'no_direct_links',
  };
  if (reservationUrl) {
    reservationCache.set(key, { expires: Math.min(Date.now() + 60_000,
      directoryMatchValid ? proof.expiresAt : Infinity), links });
    if (reservationCache.size > 128) reservationCache.delete(reservationCache.keys().next().value!);
  }
  return links;
}
