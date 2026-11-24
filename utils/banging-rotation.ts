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

export function hasBangingJourney(venue: Venue, now = Date.now()) {
  return Number.isFinite(venue.bangingTransitMinutes) && venue.bangingTransitMinutes! > 0 &&
    venue.bangingTransitMinutes! <= 120 && Number.isFinite(venue.bangingVerifiedAt) &&
    now - venue.bangingVerifiedAt! >= 0 && now - venue.bangingVerifiedAt! < 3 * 60 * 60 * 1000;
}

export function isOrganicBangingVenue(venue: Venue, now = Date.now()) {
  return !venue.promoted && !venue.premium &&
    Number(venue.rating) >= 4.3 && Boolean(venue.luxurySource) &&
    hasBangingJourney(venue, now) &&
    ['Restaurant', 'Bar', 'Pub'].includes(venue.category);
}

function isBangingFallbackVenue(venue: Venue) {
  return venue.bangingFallback === true
    && venue.banging === true
    && venue.premium !== true
    && venue.promoted !== true
    && Boolean(venue.id && venue.name)
    && ['Restaurant', 'Bar', 'Pub'].includes(venue.category);
}

export function rotateBanging(source: Venue[], now = new Date(), identity = 'panda') {
  const { day, slot } = bangingClock(now);
  const unique = [...new Map(source.map(venue => [venue.id, venue])).values()];
  // An active Banging partner placement is already verified by the partner
  // feed. Route estimates enrich the card, but must not decide whether it exists.
  const premium = unique.filter(venue => venue.banging && venue.premium);
  const eligible = unique.filter(venue =>
    isOrganicBangingVenue(venue, now.getTime()) || isBangingFallbackVenue(venue));
  const ratingValue = (venue: Venue) => {
    const rating = Number.parseFloat(venue.rating);
    return Number.isFinite(rating) ? rating : Number.NEGATIVE_INFINITY;
  };
  const stableSort = (pool: Venue[]) => [...pool].sort((a, b) =>
    ratingValue(b) - ratingValue(a) || hash(identity + ':' + a.id) - hash(identity + ':' + b.id));
  const preferred = stableSort(eligible.filter(venue => ratingValue(venue) >= 4.5));
  const broader = stableSort(eligible.filter(venue => ratingValue(venue) < 4.5));
  const dayNumber = Math.floor(Date.parse(day + 'T12:00:00Z') / 86400000);
  const rotateDaily = (pool: Venue[], offset: number) => {
    const start = pool.length ? offset % pool.length : 0;
    return [...pool.slice(start), ...pool.slice(0, start)];
  };
  const dailyPreferred = rotateDaily(preferred, dayNumber);
  const dailyBroader = rotateDaily(broader, dayNumber + preferred.length);
  const daily = [...dailyPreferred, ...dailyBroader];
  const targetCount = premium.length ? 40 : 50;
  const hasLocalFallback = daily.some(venue => venue.bangingFallback === true);
  const count = daily.length >= targetCount ? targetCount
    : hasLocalFallback || premium.length ? daily.length
      : Math.min(daily.length, Math.max(2, Math.floor(daily.length * 0.75)));
  const preferredOrganic = dailyPreferred.slice(0, Math.min(count, dailyPreferred.length));
  const broaderOrganic = dailyBroader.slice(0, Math.max(0, count - preferredOrganic.length));
  const rotate = (pool: Venue[]) => {
    const shift = pool.length ? slot % pool.length : 0;
    return [...pool.slice(shift), ...pool.slice(0, shift)];
  };
  const paidStart = premium.length ? (Math.floor(Date.parse(day + 'T12:00:00Z') / 86400000) * 6 + slot) % premium.length : 0;
  const paid = [...premium.slice(paidStart), ...premium.slice(0, paidStart)];
  const free = [...rotate(preferredOrganic), ...rotate(broaderOrganic)];
  // Never bunch Premium cards together to fill missing organic slots. When
  // there are no organic cards at all, retain a Premium-only fallback; with
  // one to three organic cards, show those honestly rather than misplacing
  // Premium cards before their fifth slot.
  if (paid.length && free.length > 0 && free.length < 4) return free;
  if (paid.length && free.length === 0) return paid;
  const result: Venue[] = [];
  let paidIndex = 0;
  while (result.length < 50) {
    if (paid.length && result.length % 5 === 4) result.push(paid[paidIndex++ % paid.length]);
    else if (free.length) result.push(free.shift()!);
    else break;
  }
  return result;
}
