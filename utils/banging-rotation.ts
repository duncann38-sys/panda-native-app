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

export function isOrganicBangingVenue(venue: Venue, now = Date.now()) {
  return !venue.promoted && !venue.premium &&
    Number(venue.rating) >= 4.3 && Boolean(venue.luxurySource) &&
    hasBangingJourney(venue, now) &&
    ['Restaurant', 'Bar', 'Pub'].includes(venue.category);
}

export function hasBangingJourney(venue: Venue, now = Date.now()) {
  return Number.isFinite(venue.bangingTransitMinutes) && venue.bangingTransitMinutes! > 0 &&
    venue.bangingTransitMinutes! <= 120 && Number.isFinite(venue.bangingVerifiedAt) &&
    now - venue.bangingVerifiedAt! >= 0 && now - venue.bangingVerifiedAt! < 3 * 60 * 60 * 1000;
}

export function rotateBanging(source: Venue[], now = new Date(), identity = 'panda') {
  const { day, slot } = bangingClock(now);
  const unique = [...new Map(source.map(venue => [venue.id, venue])).values()];
  const premium = unique.filter(venue => venue.banging && venue.premium && hasBangingJourney(venue, now.getTime()));
  const eligible = unique.filter(venue => isOrganicBangingVenue(venue, now.getTime()));
  const stable = eligible.sort((a, b) => hash(`${identity}:${a.id}`) - hash(`${identity}:${b.id}`));
  const start = stable.length ? Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) % stable.length : 0;
  const daily = [...stable.slice(start), ...stable.slice(0, start)];
  const targetCount = premium.length ? 40 : 50;
  const count = daily.length >= targetCount ? targetCount
    : Math.min(daily.length, Math.max(2, Math.floor(daily.length * 0.75)));
  const organic = daily.slice(0, count);
  // Daily selection is stable; advance the order in six four-hour London windows.
  const rotate = (pool: Venue[]) => {
    const shift = pool.length ? slot % pool.length : 0;
    return [...pool.slice(shift), ...pool.slice(0, shift)];
  };
  // Ten fixed slots in a fifty-card deck. Repeat active paid cards only when
  // fewer than ten are available; organic cards remain unique.
  const paidStart = premium.length ? (Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000) * 6 + slot) % premium.length : 0;
  const paid = [...premium.slice(paidStart), ...premium.slice(0, paidStart)];
  const free = rotate(organic);
  const result: Venue[] = [];
  let paidIndex = 0;
  while (result.length < 50) {
    if (paid.length && result.length % 5 === 4) result.push(paid[paidIndex++ % paid.length]);
    else if (free.length) result.push(free.shift()!);
    else break; // Never fill missing luxury cards with unrelated or invented venues.
  }
  return result;
}
