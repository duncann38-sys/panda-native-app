import type { Venue } from '@/data/venues';

export function googleDirectionsUrl(
  venue: Pick<Venue, 'id' | 'name' | 'fullAddress' | 'latitude' | 'longitude'>,
  mode: 'walking' | 'transit',
  origin?: { latitude: number; longitude: number } | null,
) {
  const params = new URLSearchParams({
    api: '1',
    destination: `${venue.name}, ${venue.fullAddress}`,
    travelmode: mode,
    dir_action: 'navigate',
  });
  if (venue.id.startsWith('ChI')) params.set('destination_place_id', venue.id);
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

export function knownPriceWithinBudget(price: string | null | undefined, budget: string) {
  return Boolean(price && /^£{1,4}$/.test(price) && /^£{1,4}$/.test(budget) && price.length <= budget.length);
}

export function distanceBetween(
  first: { latitude?: number | null; longitude?: number | null },
  second: { latitude?: number | null; longitude?: number | null },
) {
  if (![first.latitude, first.longitude, second.latitude, second.longitude].every(Number.isFinite)) return null;
  if ([first.latitude, second.latitude].some(value => Math.abs(value!) > 90) ||
    [first.longitude, second.longitude].some(value => Math.abs(value!) > 180)) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const lat = radians(second.latitude! - first.latitude!);
  const lng = radians(second.longitude! - first.longitude!);
  const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(first.latitude!)) *
    Math.cos(radians(second.latitude!)) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function choosePlanStops(
  stops: Array<{ categories: string[]; terms?: string[] }>,
  source: Venue[],
  budget: string,
  offset = 0,
) {
  const chosen: Venue[] = [];
  const available = source.filter(venue => knownPriceWithinBudget(venue.price, budget) &&
    Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude));
  for (const stop of stops) {
    const nearby = available.filter(venue => !chosen.some(previous => previous.id === venue.id) &&
      chosen.every(previous => {
        const distance = distanceBetween(previous, venue);
        return distance !== null && distance <= 3500;
      }));
    const matches = nearby.filter(venue => stop.categories.includes(venue.category) ||
      stop.terms?.some(term => `${venue.type} ${venue.feature} ${venue.name}`.toLowerCase().includes(term)));
    const pool = (matches.length ? matches : nearby)
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    const next = pool[offset % Math.max(1, Math.min(pool.length, 8))];
    if (!next) break;
    chosen.push(next);
  }
  return chosen;
}
