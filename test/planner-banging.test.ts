import assert from 'node:assert/strict';
import { choosePlanStops, plannerVenueEligible } from '../utils/venue-actions';
import { bangingClock, rotateBanging } from '../utils/banging-rotation';
import type { Venue } from '../data/venues';

const fixture = (id: string, category: Venue['category'], price = '£££', extra: Partial<Venue> = {}): Venue => ({
  id, name: id, category, type: category, feature: category, neighborhood: 'Chelsea',
  distance: '1 km', distanceMeters: 1000, walkingTime: '12 min', rating: '4.5',
  ratingCount: 100, price, latitude: 51.49, longitude: -0.14, description: category,
  hours: '12:00–23:00', fullAddress: 'Chelsea, London', openNow: true,
  website: 'https://example.com', mapsUri: 'https://www.google.com/maps', phone: '', banging: false, premium: false,
  promoted: false, photoAttributions: [], luxurySource: 'https://guide.michelin.com',
  bangingTransitMinutes: 45, bangingVerifiedAt: Date.now(),
  ...extra,
});
const lunch = [
  { categories: ['Restaurant'] }, { categories: ['Coffee'] }, { categories: ['Coffee'] },
];
const source = [fixture('cheap', 'Restaurant', '££', { rating: '4.9' }),
  fixture('dining', 'Restaurant', '££££'), fixture('coffee', 'Coffee', '££'),
  fixture('sweet', 'Coffee', '££'), fixture('bar', 'Bar', '£££'),
  fixture('poor', 'Restaurant', '££££', { rating: '3.9' })];
assert.deepEqual(choosePlanStops(lunch, source, '££££').map(venue => venue.id), ['dining', 'coffee', 'sweet']);
assert.equal(choosePlanStops(lunch, source.filter(venue => venue.category !== 'Coffee'), '££££').length, 1);
assert.equal(plannerVenueEligible(fixture('unknown', 'Restaurant', ''), '££££'), false);
assert.equal(plannerVenueEligible(fixture('too-expensive', 'Restaurant', '££££'), '£££'), false);
assert.equal(plannerVenueEligible(fixture('budget', 'Restaurant', '££'), '££'), true);
assert.equal(plannerVenueEligible(fixture('Battersea local dining', 'Restaurant', '££'), '££££'), true);
const night = [{ categories: ['Restaurant'] }, { categories: ['Bar', 'Pub'] },
  { categories: ['Bar', 'Pub'], lateNight: true }];
assert.equal(choosePlanStops(night, source, '££££').length, 2);
const club = fixture('club', 'Bar', '££', { type: 'Night club' });
assert.deepEqual(choosePlanStops(night, [...source, club], '££££').map(venue => venue.id), ['dining', 'bar', 'club']);
const pool = Array.from({ length: 50 }, (_, index) => fixture(`organic-${index}`, 'Restaurant', '£££', { banging: true }));
const paid = Array.from({ length: 10 }, (_, index) => fixture(`paid-${index}`, 'Pub', '££', { banging: true, premium: true, promoted: true }));
const discovery = fixture('discovery', 'Restaurant', '£££', { promoted: true });
const deck = (venues: Venue[], time: Date) => rotateBanging(venues.map(venue => ({
  ...venue, bangingVerifiedAt: time.getTime(),
})), time);
const first = deck([...pool, ...paid, discovery], new Date('2026-10-10T00:00:00Z'));
assert.equal(first.length, 50);
assert.equal(first.filter(venue => venue.premium).length, 10);
first.forEach((venue, index) => assert.equal(venue.premium, (index + 1) % 5 === 0));
assert.equal(new Set(first.filter(venue => !venue.premium).map(venue => venue.id)).size, 40);
const twoPaid = deck([...pool, ...paid.slice(0, 2)], new Date('2026-10-10T00:00:00Z'));
assert.equal(twoPaid.length, 50);
twoPaid.forEach((venue, index) => assert.equal(venue.premium, (index + 1) % 5 === 0));
assert.equal(deck([...pool, ...paid.map(venue => ({ ...venue, bangingTransitMinutes: 121 }))],
  new Date('2026-10-10T00:00:00Z')) .some(venue => venue.premium), false);
assert.equal(deck([fixture('ordinary expensive', 'Restaurant', '££££', { luxurySource: '' })],
  new Date('2026-10-10T00:00:00Z')).length, 0);
assert.equal(rotateBanging(pool.map(venue => ({ ...venue, bangingVerifiedAt: 0 }))).length, 0);
assert.equal(first.some(venue => venue.id === 'discovery'), false);
const orders = new Set(Array.from({ length: 6 }, (_, slot) =>
  deck([...pool, ...paid], new Date(`2026-10-10T${String(slot * 4).padStart(2, '0')}:00:00Z`)).map(venue => venue.id).join(',')));
assert.equal(orders.size, 6);
const tomorrow = deck([...pool, ...paid], new Date('2026-10-11T00:00:00Z'));
assert.notDeepEqual(first.filter(venue => !venue.premium).map(venue => venue.id).sort(),
  tomorrow.filter(venue => !venue.premium).map(venue => venue.id).sort());
assert.equal(bangingClock(new Date('2026-10-10T23:30:00Z')).day, '2026-10-11');
const small = pool.slice(0, 3);
const smallOrders = Array.from({ length: 6 }, (_, slot) =>
  deck(small, new Date(`2026-10-10T${String(slot * 4).padStart(2, '0')}:00:00Z`))
    .map(venue => venue.id).join(','));
assert.equal(smallOrders.filter((value, i) => i && value !== smallOrders[i - 1]).length, 5);
assert.notDeepEqual(
  deck(small, new Date('2026-10-10T00:00:00Z')).map(v => v.id).sort(),
  deck(small, new Date('2026-10-11T00:00:00Z')).map(v => v.id).sort());
const alternatives = [
  fixture('meal-a', 'Restaurant', '££££'), fixture('meal-b', 'Restaurant', '£££'),
  fixture('coffee-a', 'Coffee', '££'), fixture('coffee-b', 'Coffee', '££'),
  fixture('coffee-c', 'Coffee', '££'), fixture('coffee-d', 'Coffee', '££'),
];
const planOne = choosePlanStops(lunch, alternatives, '££££');
const planTwo = choosePlanStops(lunch, alternatives, '££££', 0, { excludedIds: planOne.map(venue => venue.id) });
assert.equal(planTwo.length, 3);
assert.equal(planTwo.some(venue => planOne.some(first => first.id === venue.id)), false);
assert.equal(choosePlanStops(lunch, alternatives, '££££', 0, {
  excludedIds: [...planOne, ...planTwo].map(venue => venue.id),
}).length, 0);
assert.equal(choosePlanStops(lunch, [fixture('distant', 'Restaurant', '££££', { distanceMeters: 20000 }),
  fixture('nearest', 'Restaurant', '££', { distanceMeters: 100 })], '££££')[0].id, 'nearest');
assert.equal(choosePlanStops(lunch, alternatives, '£££').some(venue => venue.price.length > 3), false);
console.log('Planner quality, strict stop roles, real prices, daily selection, six order windows and paid-tier separation passed.');
