import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDirectionsUrl, knownPriceWithinBudget, choosePlanStops, distanceBetween } from '../utils/venue-actions.ts';

const sample = (id, category, price, latitude = 51.50, longitude = -0.12) => ({
  id, name: id, category, price, latitude, longitude, fullAddress: 'London',
  rating: '4.6', type: category, feature: category,
});

test('walking starts navigation in Google Maps using its current-location default', () => {
  const url = new URL(googleDirectionsUrl(sample('ChIJproof', 'Restaurant', '££'), 'walking'));
  assert.equal(url.hostname, 'www.google.com');
  assert.equal(url.searchParams.get('travelmode'), 'walking');
  assert.equal(url.searchParams.get('dir_action'), 'navigate');
  assert.equal(url.searchParams.get('destination_place_id'), 'ChIJproof');
  assert.equal(url.searchParams.has('origin'), false);
});
test('transit selects Google public transport, not internal Panda routing', () => {
  assert.equal(new URL(googleDirectionsUrl(sample('ChIJproof', 'Bar', '£'), 'transit')).searchParams.get('travelmode'), 'transit');
});
test('unknown or excessive prices cannot pass a money filter', () => {
  assert.equal(knownPriceWithinBudget('£', '££'), true);
  for (const price of [null, undefined, '', '£££', 'Unknown']) assert.equal(knownPriceWithinBudget(price, '££'), false);
  assert.equal(knownPriceWithinBudget('£', 'Any price'), false);
});
test('a plan uses distinct nearby real candidates within its budget', () => {
  const stops = [{ categories: ['Coffee'] }, { categories: ['Restaurant'] }, { categories: ['Bar'] }];
  const candidates = [
    sample('coffee', 'Coffee', '£'), sample('restaurant', 'Restaurant', '££', 51.501),
    sample('bar', 'Bar', '££', 51.503), sample('expensive', 'Restaurant', '£££'),
    sample('too-far', 'Bar', '£', 51.8), sample('unknown', 'Restaurant', ''),
  ];
  assert.deepEqual(choosePlanStops(stops, candidates, '££').map(venue => venue.id), ['coffee', 'restaurant', 'bar']);
  assert.ok(choosePlanStops(stops, candidates, '£').every(venue => venue.price === '£'));
});
test('missing or invalid coordinates never become a fabricated walking route', () => {
  assert.equal(distanceBetween({}, sample('a', 'Bar', '£')), null);
  assert.equal(distanceBetween({ latitude: 95, longitude: 0 }, { latitude: 51, longitude: 0 }), null);
  assert.equal(distanceBetween({ latitude: 51, longitude: 0 }, { latitude: 51, longitude: 0 }), 0);
});
