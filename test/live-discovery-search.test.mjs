import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceLiveSearchCursor,
  hasMoreLiveSearch,
  liveDiscoveryNearbyTypes,
  liveSearchRequest,
  LIVE_DISCOVERY_EXPANSION_RINGS_KM,
} from '../utils/live-discovery-search.ts';
import { classifyGooglePlace } from '../data/venue-categories.ts';

test('typed category fallbacks cover requested Google types without reviving removed tabs', () => {
  assert.deepEqual(liveDiscoveryNearbyTypes('Pubs'), ['pub', 'bar', 'beer_garden']);
  assert.ok(liveDiscoveryNearbyTypes('Sports').includes('sports_complex'));
  assert.ok(liveDiscoveryNearbyTypes('Live Music').includes('concert_hall'));
  assert.ok(liveDiscoveryNearbyTypes('Places of Interest').includes('art_gallery'));
  assert.deepEqual(liveDiscoveryNearbyTypes('Dessert'), []);
  assert.deepEqual(liveDiscoveryNearbyTypes('Brunch'), []);
  assert.deepEqual(liveDiscoveryNearbyTypes('Clubs'), []);
});

test('live search rings grow outward and page tokens retain their original radius', () => {
  assert.deepEqual(LIVE_DISCOVERY_EXPANSION_RINGS_KM, [1.2, 2.4, 3.6, 4, 6, 8, 10, 12, 16, 20]);
  assert.deepEqual(liveSearchRequest({ ringIndex: -1 }), {});
  assert.deepEqual(advanceLiveSearchCursor({ ringIndex: -1 }), { ringIndex: 0 });
  assert.deepEqual(liveSearchRequest({ ringIndex: 0 }), { expansionRingKm: 1.2 });
  const nextPage = advanceLiveSearchCursor({ ringIndex: 0 }, 'next-page-token', true);
  assert.deepEqual(nextPage, { pageToken: 'next-page-token', ringIndex: 0 });
  assert.deepEqual(liveSearchRequest(nextPage), { pageToken: 'next-page-token', expansionRingKm: 1.2 });
  assert.deepEqual(advanceLiveSearchCursor(nextPage, undefined, true), { ringIndex: 1 });
  assert.equal(liveSearchRequest({ ringIndex: 9 }).expansionRingKm, 20);
  assert.equal(advanceLiveSearchCursor({ ringIndex: 9 }, undefined, true), undefined);
  assert.equal(hasMoreLiveSearch({ ringIndex: -1 }), true);
  assert.equal(hasMoreLiveSearch(undefined), false);
});

test('Native classification keeps Google type matches and WAP-style search context', () => {
  const classify = (primaryType, types, sourceQueries = []) => classifyGooglePlace({
    name: 'Example venue', type: primaryType, primaryType, types, sourceQueries,
  }).categories;
  assert.ok(classify('beer_garden', ['beer_garden']).includes('Pubs'));
  assert.ok(classify('sports_complex', ['sports_complex']).includes('Sports'));
  assert.ok(classify('concert_hall', ['concert_hall']).includes('Live Music'));
  assert.ok(classify('restaurant', ['restaurant'], ['American diner']).includes('American'));
  assert.ok(classify('restaurant', ['restaurant'], ['Lebanese Middle Eastern']).includes('Lebanese'));
  assert.ok(classify('bar', ['bar'], ['live music venues concert halls karaoke music bars']).includes('Live Music'));
  assert.ok(classify('bar', ['bar'], ['pubs gastropubs beer gardens']).includes('Pubs'));
  assert.ok(classify('bar', ['bar'], ['nightlife bars clubs dance halls karaoke']).includes('Nightlife'));
  const genericBar = classify('bar', ['bar']);
  assert.equal(genericBar.includes('Pubs'), false);
  assert.equal(genericBar.includes('Sports'), false);
  assert.equal(genericBar.includes('Live Music'), false);
});
