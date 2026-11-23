import { PANDA_RUNTIME_API } from '@/constants/services';
import { isGooglePlaceVenue } from './google-place-eligibility';

export type OfficialVenueLinks = {
  placeId?: string;
  phone?: string | null;
  website: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  source: 'official_website';
  lookupStatus: 'verified' | 'no_direct_links' | 'unavailable';
  reservationSource?: 'official_website' | 'opentable_directory';
  openTableMatch?: {
    placeId: string;
    rid: number;
    environment: 'production';
    method: string;
    expiresAt: number;
  };
  openTableLookup?: string;
};
export function safeVenuePhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]{7,32}$/.test(value.trim())) return null;
  const number = value.trim().replace(/[^\d+]/g, '');
  return /^\+?\d{7,15}$/.test(number) ? number : null;
}

export function safeVenueUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (/^(?:localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname)
      || /\.(?:local|localhost)$/i.test(url.hostname)
      || /^(?:maps\.|maps\.app\.goo\.gl$)/i.test(url.hostname)
      || (/(?:^|\.)google\.[a-z.]+$/i.test(url.hostname) && /^\/(?:maps|search)(?:\/|$)/.test(url.pathname))) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function generalVenueActionUrl(value: unknown, kind: 'menu' | 'reservation'): string | null {
  const url = safeVenueUrl(value);
  if (!url) return null;
  let text: string;
  try { text = decodeURIComponent(new URL(url).pathname + new URL(url).search).toLowerCase().replace(/[^a-z0-9]+/g, ' '); }
  catch { return null; }
  if (/\b(christmas|xmas|festive|nye|valentine|easter|wedding)\b/.test(text)) return null;
  if (kind === 'reservation' && /\b(tickets?|events?|cinema|movies?|private hire|book rooms?)\b/.test(text)) return null;
  return url;
}

export async function loadOfficialVenueLinks(
  id: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  intent: 'all' | 'reservation' = 'all',
): Promise<OfficialVenueLinks> {
  if (!isGooglePlaceVenue({ id })) throw new Error('A Google venue is required.');
  const response = await fetchImpl(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(id)}/links${intent === 'reservation' ? '?intent=reservation' : ''}`, {
    headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('Official venue links could not be checked.');
  const data = await response.json() as Partial<OfficialVenueLinks>;
  if (data.source !== 'official_website') throw new Error('Official venue links have no verified source.');
  if (data.placeId && data.placeId !== id) throw new Error('Venue contact identity does not match.');
  const website = safeVenueUrl(data.website);
  const menu = generalVenueActionUrl(data.menuUrl, 'menu');
  const reservation = generalVenueActionUrl(data.reservationUrl, 'reservation');
  const menuUrl = data.lookupStatus === 'unavailable' || menu === website ? null : menu;
  const proof = data.openTableMatch;
  const directoryMatchValid = proof?.placeId === id && proof.environment === 'production'
    && Number.isSafeInteger(proof.rid) && proof.rid > 0 && Number.isFinite(proof.expiresAt)
    && proof.expiresAt > Date.now() && ['name_address_coordinates', 'name_phone_coordinates',
      'name_postcode_number_coordinates', 'name_alias_address_phone_coordinates'].includes(proof.method);
  const reservationUrl = data.lookupStatus === 'unavailable' || reservation === website
    || (data.reservationSource === 'opentable_directory' && !directoryMatchValid) ? null : reservation;
  return {
    placeId: id, phone: safeVenuePhone(data.phone), website, menuUrl, reservationUrl, source: 'official_website',
    reservationSource: data.reservationSource === 'opentable_directory' ? 'opentable_directory' : 'official_website',
    ...(directoryMatchValid ? { openTableMatch: proof } : {}),
    ...(typeof data.openTableLookup === 'string' ? { openTableLookup: data.openTableLookup } : {}),
    lookupStatus: data.lookupStatus === 'unavailable'
      ? 'unavailable' : menuUrl || reservationUrl ? 'verified' : 'no_direct_links',
  };
}
