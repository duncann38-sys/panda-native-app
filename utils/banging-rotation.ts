import type { Venue } from '@/data/venues';

const UPSCALE_CLUSTER_RADIUS_METRES = 1_800;
const MIN_UPSCALE_CLUSTER_VENUES = 3;
const HIGH_END_DINING_SIGNAL = /\b(fine dining|tasting menu|michelin|chef'?s table|omakase|upscale|luxury hotel|destination dining|private dining)\b/i;
const FAST_CASUAL_OR_TAKEAWAY = /\b(fast[- ]?food|quick service|take[- ]?away|meal takeaway|drive[- ]?thru|food court)\b/i;
const KNOWN_CHAINS = /\b(mcdonald'?s|kfc|burger king|subway|domino'?s|pizza hut|pizza ?express|zizzi|prezzo|ask italian|bella italia|frankie and benny'?s|tgi fridays|wagamama|nando'?s|five guys|taco bell|leon|itsu|greggs|pret a manger|costa coffee|starbucks|caffe nero|shake shack|papa john'?s|yo!? sushi|dishoom|flat iron|hawksmoor|the ivy)\b/i;

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

function priceLevel(venue: Venue) {
  return (String(venue.price || '').match(/[£$]/g) || []).length;
}

function isChainOrCasualVenue(venue: Venue) {
  const identity = `${venue.name} ${venue.type} ${venue.feature}`;
  return FAST_CASUAL_OR_TAKEAWAY.test(identity) || KNOWN_CHAINS.test(venue.name);
}

function hasHighEndDiningSignal(venue: Venue) {
  return Boolean(venue.luxurySource) ||
    (priceLevel(venue) >= 3 && HIGH_END_DINING_SIGNAL.test(`${venue.name} ${venue.type} ${venue.feature}`));
}

function validLocation(venue: Venue) {
  return Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)
    && Math.abs(venue.latitude!) <= 90 && Math.abs(venue.longitude!) <= 180;
}

function distanceBetweenMetres(first: Venue, second: Venue) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude! - first.latitude!);
  const longitudeDelta = radians(second.longitude! - first.longitude!);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude!)) * Math.cos(radians(second.latitude!))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function hasBangingJourney(venue: Venue, now = Date.now()) {
  return Number.isFinite(venue.bangingTransitMinutes) && venue.bangingTransitMinutes! > 0 &&
    venue.bangingTransitMinutes! <= 120 && Number.isFinite(venue.bangingVerifiedAt) &&
    now - venue.bangingVerifiedAt! >= 0 && now - venue.bangingVerifiedAt! < 3 * 60 * 60 * 1000;
}

export function isOrganicBangingVenue(venue: Venue, now = Date.now()) {
  return !venue.promoted && !venue.premium &&
    Number(venue.rating) >= 4.5 && Number(venue.rating) <= 5 &&
    hasHighEndDiningSignal(venue) && !isChainOrCasualVenue(venue) &&
    hasBangingJourney(venue, now) &&
    venue.category === 'Restaurant';
}

function isBangingFallbackVenue(venue: Venue) {
  return venue.bangingFallback === true
    && venue.banging === true
    && venue.premium !== true
    && venue.promoted !== true
    && Boolean(venue.id && venue.name)
    && Number(venue.rating) >= 4.5
    && Number(venue.rating) <= 5
    && validLocation(venue)
    && hasHighEndDiningSignal(venue)
    && !isChainOrCasualVenue(venue)
    && venue.category === 'Restaurant';
}

export function isBangingUpscaleClusterVenue(venue: Venue, pool: Venue[]) {
  if (!validLocation(venue) || priceLevel(venue) < 3 || isChainOrCasualVenue(venue)) return false;
  let upscaleNeighbours = 0;
  for (const candidate of pool) {
    if (candidate.id === venue.id || !validLocation(candidate)
      || priceLevel(candidate) < 3 || isChainOrCasualVenue(candidate)) continue;
    if (distanceBetweenMetres(venue, candidate) <= UPSCALE_CLUSTER_RADIUS_METRES) upscaleNeighbours += 1;
  }
  return upscaleNeighbours + 1 >= MIN_UPSCALE_CLUSTER_VENUES;
}

export function rotateBanging(
  source: Venue[],
  now = new Date(),
  identity = 'panda',
) {
  const { day, slot } = bangingClock(now);
  const unique = [...new Map(source.map(venue => [venue.id, venue])).values()];
  // An active Banging partner placement is already verified by the partner
  // feed. Route estimates enrich the card, but must not decide whether it exists.
  const premium = unique.filter(venue => venue.banging && venue.premium);
  const eligible = unique.filter(venue =>
    isOrganicBangingVenue(venue, now.getTime()) || isBangingFallbackVenue(venue));
  const verified = eligible.filter(venue => venue.bangingFallback !== true);
  const cachedFallback = eligible.filter(venue => venue.bangingFallback === true);
  const ratingValue = (venue: Venue) => {
    const rating = Number.parseFloat(venue.rating);
    return Number.isFinite(rating) ? rating : Number.NEGATIVE_INFINITY;
  };
  const reviewVolume = (venue: Venue) => Number.isFinite(venue.ratingCount) ? venue.ratingCount : 0;
  const stableSort = (pool: Venue[]) => [...pool].sort((a, b) =>
    ratingValue(b) - ratingValue(a) || reviewVolume(b) - reviewVolume(a)
      || hash(identity + ':' + a.id) - hash(identity + ':' + b.id));
  const expensiveCluster = new Set(verified
    .filter(venue => isBangingUpscaleClusterVenue(venue, eligible))
    .map(venue => venue.id));
  const flagship = stableSort(verified.filter(venue =>
    ratingValue(venue) >= 4.8 && ratingValue(venue) <= 5
      && reviewVolume(venue) >= 200 && priceLevel(venue) >= 3 && expensiveCluster.has(venue.id)));
  const otherFlagshipRated = stableSort(verified.filter(venue =>
    ratingValue(venue) >= 4.8 && !flagship.some(item => item.id === venue.id)));
  const clusteredUpscale = stableSort(verified.filter(venue =>
    ratingValue(venue) >= 4.5 && ratingValue(venue) < 4.8
      && priceLevel(venue) >= 3 && expensiveCluster.has(venue.id)));
  const widerUpscale = stableSort(verified.filter(venue =>
    ratingValue(venue) >= 4.5 && !flagship.some(item => item.id === venue.id)
      && !otherFlagshipRated.some(item => item.id === venue.id)
      && !clusteredUpscale.some(item => item.id === venue.id)));
  const localFallback = stableSort(cachedFallback);
  const dayNumber = Math.floor(Date.parse(day + 'T12:00:00Z') / 86400000);
  const tiers = [flagship, otherFlagshipRated, clusteredUpscale, widerUpscale, localFallback];
  // Keep the complete 50-card deck available on the first open. The tiers
  // determine ranking, not whether lower-ranked quality results are hidden.
  const selected = tiers.flat();
  const targetCount = premium.length ? 40 : 50;
  const free = selected.slice(0, targetCount);
  const paidStart = premium.length
    ? (dayNumber * 6 + slot + hash(identity)) % premium.length
    : 0;
  const paid = [...premium.slice(paidStart), ...premium.slice(0, paidStart)];
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
