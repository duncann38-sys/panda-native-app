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
  stops: Array<{ categories: string[]; terms?: string[]; lateNight?: boolean }>,
  source: Venue[],
  budget: string,
  offset = 0,
  options: {
    excludedIds?: readonly string[];
    origin?: { latitude: number; longitude: number } | null;
  } = {},
) {
  const chosen: Venue[] = [];
  const excluded = new Set(options.excludedIds || []);
  const available = [...new Map(source.map(venue => [venue.id, venue])).values()].filter(venue =>
    !excluded.has(venue.id) && plannerVenueEligible(venue, budget) &&
    Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude));
  for (const stop of stops) {
    const nearby = available.filter(venue => !chosen.some(previous => previous.id === venue.id) &&
      chosen.every(previous => {
        const distance = distanceBetween(previous, venue);
        // Distance is only a coarse candidate bound. Google verifies the
        // actual one-hour journey before any plan is shown.
        return distance !== null && distance <= 60000;
      }));
    const matches = nearby.filter(venue => {
      if (stop.lateNight) return isLateNightVenue(venue);
      return stop.categories.includes(venue.category);
    });
    // Never replace a missing coffee/dinner/club stop with an unrelated venue.
    const pool = matches.sort((a, b) => {
      const distance = (venue: Venue) => options.origin ? distanceBetween(options.origin, venue) ?? Infinity
        : Number.isFinite(venue.distanceMeters) ? venue.distanceMeters : Infinity;
      // Prefer the immediate neighbourhood before a more expensive venue
      // several streets away; price decides between similarly nearby choices.
      const ring = (venue: Venue) => Math.floor(distance(venue) / 250);
      const target = budget.length;
      const coherence = (venue: Venue) => Math.abs(venue.price.length - target);
      return ring(a) - ring(b) || coherence(a) - coherence(b) || (stop.lateNight
        ? nightlifeScore(b) - nightlifeScore(a)
        : Number(b.openNow) - Number(a.openNow) || Number(b.rating || 0) - Number(a.rating || 0) ||
          Math.log(b.ratingCount + 1) - Math.log(a.ratingCount + 1));
    });
    const next = pool[offset % Math.max(1, pool.length)];
    if (!next) break;
    chosen.push(next);
  }
  return chosen;
}

export function plannerVenueEligible(venue: Venue, budget: string) {
  if (!knownPriceWithinBudget(venue.price, budget) || Number(venue.rating) < 4 || !Number.isFinite(Number(venue.rating))) return false;
  // The selected price is a spending ceiling, not a minimum admission price.
  // Rank more expensive choices first nearby, but do not hide real local
  // restaurants (including Battersea Power Station) simply because they cost less.
  return true;
}

export function isLateNightVenue(venue: Venue) {
  const text = `${venue.type} ${venue.feature} ${venue.description} ${venue.hours}`.toLowerCase();
  if (/\b(night.?club|disco|late.?night|late bar|members.? club)\b/.test(text)) return true;
  return ['Bar', 'Pub'].includes(venue.category) &&
    /\b(?:(?:12|[1-5])(?::[0-5]\d)?\s*am|0[0-5]:[0-5]\d|midnight)\b/.test(text);
}

export function nightlifeScore(venue: Venue) {
  const text = `${venue.type} ${venue.feature} ${venue.description}`.toLowerCase();
  return (Number(venue.rating) || 0) * Math.log((Number(venue.ratingCount) || 0) + 10) +
    (/\b(members|exclusive|private club)\b/.test(text) ? 8 : 0) +
    (/night.?club|disco/.test(text) ? 4 : 0);
}

export function interleavePromotions(source: Venue[]) {
  const organic = source.filter(venue => !venue.promoted);
  const promoted = source.filter(venue => venue.promoted);
  const result: Venue[] = [];
  for (const venue of organic) {
    result.push(venue);
    if ((result.length + 1) % 5 === 0 && promoted.length) result.push(promoted.shift()!);
  }
  return result;
}
