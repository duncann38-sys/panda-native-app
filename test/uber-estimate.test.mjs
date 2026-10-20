import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUberEstimate } from '../utils/uber-estimate.ts';

const venue = { latitude: 51.48, longitude: -0.14, venueName: 'Alma Nine Elms' };
test('the £5 planning buffer increases both ends of every fare band without changing travel time', () => {
  for (const [distanceMeters, minutes, minFare, maxFare] of [
    [398, 4, 9, 13],
    [1000, 6, 10, 14],
    [5000, 18, 17, 25],
  ]) {
    const estimate = buildUberEstimate({ ...venue, distanceMeters });
    assert.ok(estimate);
    assert.deepEqual([estimate.minutes, estimate.minFare, estimate.maxFare], [minutes, minFare, maxFare]);
    assert.equal(estimate.label, `~${minutes} mins • £${minFare}–£${maxFare}`);
  }
});
test('a supplied driving duration still takes precedence and receives the same £5 adjustment', () => {
  const estimate = buildUberEstimate({ ...venue, distanceMeters: 10000, driveDurationMinutes: 12 });
  assert.ok(estimate);
  assert.deepEqual([estimate.minutes, estimate.minFare, estimate.maxFare], [12, 22, 32]);
});
test('Uber destination, pickup and encoded venue name are unchanged', () => {
  const name = 'Duck & Rice / Soho';
  const estimate = buildUberEstimate({ ...venue, venueName: name, distanceMeters: 1000 });
  const link = new URL(estimate.deepLink);
  assert.equal(link.origin, 'https://m.uber.com');
  assert.equal(link.searchParams.get('action'), 'setPickup');
  assert.equal(link.searchParams.get('pickup'), 'my_location');
  assert.equal(link.searchParams.get('dropoff[latitude]'), String(venue.latitude));
  assert.equal(link.searchParams.get('dropoff[longitude]'), String(venue.longitude));
  assert.equal(link.searchParams.get('dropoff[nickname]'), name);
});
test('invalid coordinates and distances still suppress the estimate', () => {
  for (const input of [
    { latitude: NaN, distanceMeters: 1000 },
    { longitude: 181, distanceMeters: 1000 },
    { distanceMeters: 0 }, { distanceMeters: -1 },
    { distanceMeters: Infinity }, { distanceMeters: 250001 },
  ]) assert.equal(buildUberEstimate({ ...venue, ...input }), null);
});
