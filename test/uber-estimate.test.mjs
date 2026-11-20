import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUberEstimate, isLocalPeakTime } from '../utils/uber-estimate.ts';

const venue = { latitude: 51.48, longitude: -0.14, venueName: 'Alma Nine Elms' };
const weekdayPeak = new Date(2026, 10, 23, 8, 0);
const weekdayOffPeak = new Date(2026, 10, 23, 12, 0);

test('the existing planning buffer remains and peak hours add a further £5 without changing travel time', () => {
  for (const [distanceMeters, minutes, minFare, maxFare] of [
    [398, 4, 9, 13],
    [1000, 6, 10, 14],
    [5000, 18, 17, 25],
  ]) {
    const estimate = buildUberEstimate({ ...venue, distanceMeters, now: weekdayOffPeak });
    assert.ok(estimate);
    assert.deepEqual([estimate.minutes, estimate.minFare, estimate.maxFare], [minutes, minFare, maxFare]);
    assert.equal(estimate.label, `~${minutes} mins • £${minFare}–£${maxFare}`);
    assert.equal(estimate.peakTime, false);
    assert.equal(estimate.planningBufferGbp, 5);
    assert.equal(estimate.peakBufferGbp, 0);

    const peakEstimate = buildUberEstimate({ ...venue, distanceMeters, now: weekdayPeak });
    assert.ok(peakEstimate);
    assert.deepEqual([peakEstimate.minFare, peakEstimate.maxFare], [minFare + 5, maxFare + 5]);
    assert.equal(peakEstimate.peakTime, true);
    assert.equal(peakEstimate.peakBufferGbp, 5);
  }
});
test('a supplied driving duration still takes precedence and receives both planning buffers at peak', () => {
  const estimate = buildUberEstimate({ ...venue, distanceMeters: 10000, driveDurationMinutes: 12, now: weekdayPeak });
  assert.ok(estimate);
  assert.deepEqual([estimate.minutes, estimate.minFare, estimate.maxFare], [12, 27, 37]);
});
test('local weekday peak windows exclude nights, midday and weekends', () => {
  assert.equal(isLocalPeakTime(new Date(2026, 10, 23, 7, 0)), true);
  assert.equal(isLocalPeakTime(new Date(2026, 10, 23, 9, 59)), true);
  assert.equal(isLocalPeakTime(new Date(2026, 10, 23, 10, 0)), false);
  assert.equal(isLocalPeakTime(new Date(2026, 10, 23, 16, 0)), true);
  assert.equal(isLocalPeakTime(new Date(2026, 10, 23, 19, 0)), false);
  assert.equal(isLocalPeakTime(new Date(2026, 10, 21, 8, 0)), false);
});
test('Uber destination, pickup and encoded venue name are unchanged', () => {
  const name = 'Duck & Rice / Soho';
  const estimate = buildUberEstimate({ ...venue, venueName: name, distanceMeters: 1000, now: weekdayOffPeak });
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
