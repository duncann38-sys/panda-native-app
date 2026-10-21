import { PANDA_RUNTIME_API } from '@/constants/services';

export type OfficialVenueLinks = { menuUrl?: string; reservationUrl?: string; website?: string };
const cache = new Map<string, { expires: number; links: OfficialVenueLinks }>();
const pending = new Map<string, Promise<OfficialVenueLinks | null>>();

export function officialPageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

// Only links identified by Panda's official-site resolver are menu links.
// Never manufacture /menu paths or treat a search result as a restaurant menu.
export function getOfficialVenueLinks(id: string, refresh = false): Promise<OfficialVenueLinks | null> {
  const saved = cache.get(id);
  if (!refresh && saved && saved.expires > Date.now()) return Promise.resolve(saved.links);
  const existing = pending.get(id);
  if (existing) return existing;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const request = fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(id)}/links`, {
    signal: controller.signal,
  }).then(async response => {
    if (!response.ok) throw new Error('Official links unavailable');
    const payload = await response.json();
    const links: OfficialVenueLinks = {
      menuUrl: officialPageUrl(payload.menuUrl),
      reservationUrl: officialPageUrl(payload.reservationUrl),
      website: officialPageUrl(payload.website),
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
