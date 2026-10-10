import type { Venue } from '@/data/venues';

export function bangingClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, slot: Math.floor(Number(get('hour')) / 4) };
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function isOrganicBangingVenue(venue: Venue) {
  return !venue.promoted && !venue.premium &&
    Number(venue.rating) >= 4 && venue.price.length >= 3 && venue.distanceMeters <= 20000 &&
    ['Restaurant', 'Bar', 'Pub'].includes(venue.category);
}

export function rotateBanging(source: Venue[], now = new Date(), identity = 'panda') {
  const { day, slot } = bangingClock(now);
  const unique = [...new Map(source.map(venue => [venue.id, venue])).values()];
  const premium = unique.filter(venue => venue.banging && venue.premium);
  const eligible = unique.filter(isOrganicBangingVenue);
  const stable = eligible.sort((a, b) => hash(`${identity}:${a.id}`) - hash(`${identity}:${b.id}`));
  const start = stable.length ? Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) % stable.length : 0;
  const daily = [...stable.slice(start), ...stable.slice(0, start)];
  const count = Math.min(Math.max(0, 40 - Math.min(10, premium.length)),
    daily.length, Math.max(2, Math.floor(daily.length * 0.75)));
  const organic = daily.slice(0, count);
  // Daily selection is stable; advance the order in six four-hour London windows.
  const rotate = (pool: Venue[]) => {
    const shift = pool.length ? slot % pool.length : 0;
    return [...pool.slice(shift), ...pool.slice(0, shift)];
  };
  const paid = rotate(premium.slice(0, 10));
  const free = rotate(organic);
  const result: Venue[] = [];
  while (free.length || paid.length) {
    if (paid.length && (result.length % 5 === 4 || !free.length)) result.push(paid.shift()!);
    else result.push(free.shift()!);
  }
  return result;
}
