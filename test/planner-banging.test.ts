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
  promoted: false, photoAttributions: [],
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
const night = [{ categories: ['Restaurant'] }, { categories: ['Bar', 'Pub'] },
  { categories: ['Bar', 'Pub'], lateNight: true }];
assert.equal(choosePlanStops(night, source, '££££').length, 2);
const club = fixture('club', 'Bar', '£££', { type: 'Night club' });
assert.deepEqual(choosePlanStops(night, [...source, club], '££££').map(venue => venue.id), ['dining', 'bar', 'club']);
const pool = Array.from({ length: 50 }, (_, index) => fixture(`organic-${index}`, 'Restaurant', '£££', { banging: true }));
const paid = Array.from({ length: 10 }, (_, index) => fixture(`paid-${index}`, 'Pub', '££', { banging: true, premium: true, promoted: true }));
const discovery = fixture('discovery', 'Restaurant', '£££', { promoted: true });
const first = rotateBanging([...pool, ...paid, discovery], new Date('2026-10-10T00:00:00Z'));
assert.equal(first.length, 40);
assert.equal(first.filter(venue => venue.premium).length, 10);
assert.equal(first.some(venue => venue.id === 'discovery'), false);
const orders = new Set(Array.from({ length: 6 }, (_, slot) =>
  rotateBanging([...pool, ...paid], new Date(`2026-10-10T${String(slot * 4).padStart(2, '0')}:00:00Z`)).map(venue => venue.id).join(',')));
assert.equal(orders.size, 6);
const tomorrow = rotateBanging([...pool, ...paid], new Date('2026-10-11T00:00:00Z'));
assert.notDeepEqual(first.filter(venue => !venue.premium).map(venue => venue.id).sort(),
  tomorrow.filter(venue => !venue.premium).map(venue => venue.id).sort());
assert.equal(bangingClock(new Date('2026-10-10T23:30:00Z')).day, '2026-10-11');
console.log('Planner quality, strict stop roles, real prices, daily selection, six order windows and paid-tier separation passed.');
