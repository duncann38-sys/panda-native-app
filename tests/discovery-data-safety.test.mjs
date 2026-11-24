import assert from 'node:assert/strict';
import test from 'node:test';
import {
  finiteNumberOrUndefined,
  normalizeDiscoveryVenue,
  normalizeDiscoveryVenueList,
  normalizeMapCoordinate,
} from '../utils/discovery-data-safety.ts';

const venue = (overrides = {}) => ({
  id: 'place-1',
  name: 'Example place',
  category: 'Restaurant',
  latitude: 51.5,
  longitude: -0.12,
  distanceMeters: 120,
  photoAttributions: ['Google'],
  ...overrides,
});

test('numeric parsing rejects null, blanks, booleans, and non-finite values', () => {
  for (const value of [null, '', '  ', false, true, NaN, Infinity, -Infinity, {}, []]) {
    assert.equal(finiteNumberOrUndefined(value), undefined);
  }
  assert.equal(finiteNumberOrUndefined(0), 0);
  assert.equal(finiteNumberOrUndefined('51.5'), 51.5);
});

test('map coordinates require finite values in geographic bounds', () => {
  assert.deepEqual(normalizeMapCoordinate({ latitude: '51.5', longitude: '-0.12' }), {
    latitude: 51.5,
    longitude: -0.12,
  });
  for (const value of [
    { latitude: null, longitude: 0 },
    { latitude: '', longitude: 0 },
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    null,
  ]) {
    assert.equal(normalizeMapCoordinate(value), null);
  }
});

test('malformed cached/category venues are dropped and safe optional data defaults to arrays', () => {
  const normalized = normalizeDiscoveryVenue(venue({
    photoAttributions: [' Verified ', null],
    photoNames: [null, { name: 'cover', attribution: 'Google' }, { name: 3 }],
    photoUris: [null, { uri: 'https://example.test/photo.jpg' }, { uri: '' }],
    discoveryCategories: ['Indian', 'Unknown'],
  }));
  assert.ok(normalized);
  assert.deepEqual(normalized.photoAttributions, ['Verified']);
  assert.deepEqual(normalized.photoNames, [{ name: 'cover', attribution: 'Google' }]);
  assert.deepEqual(normalized.photoUris, [{ uri: 'https://example.test/photo.jpg', attribution: '' }]);
  assert.deepEqual(normalized.discoveryCategories, ['Indian']);

  assert.equal(normalizeDiscoveryVenue(null), null);
  assert.equal(normalizeDiscoveryVenue(venue({ id: ' ' })), null);
  assert.equal(normalizeDiscoveryVenue(venue({ latitude: null })), null);
  assert.deepEqual(normalizeDiscoveryVenueList([null, venue(), venue(), venue({ id: '' })]).map((item) => item.id), ['place-1']);
  assert.deepEqual(normalizeDiscoveryVenueList({ venues: [venue()] }), []);
});
