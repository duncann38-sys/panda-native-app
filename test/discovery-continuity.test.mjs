import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LatestDiscoverySelection, shouldFillDiscovery } from '../utils/discovery-continuity.ts';

test('a busy request does not consume or lose the latest category selection', () => {
  const queue = new LatestDiscoverySelection();
  queue.request('Coffee');
  assert.equal(queue.take(true), null);
  queue.request('Dinner');
  queue.request('Pubs');
  assert.equal(queue.take(false), 'Pubs');
  assert.equal(queue.take(false), null);
});
test('returning to All discards any queued category rather than loading it later', () => {
  const queue = new LatestDiscoverySelection();
  queue.request('Coffee');
  queue.clear();
  assert.equal(queue.take(false), null);
});
const short = { count: 2, busy: false, hasCursor: true, exhausted: false, attempts: 0, retryAt: 0, now: 100 };
test('short lists continue automatically without waiting for another scroll event', () => {
  assert.equal(shouldFillDiscovery(short), true);
  for (const change of [{ busy: true }, { hasCursor: false }, { exhausted: true }, { count: 8 }, { attempts: 3 }, { retryAt: 101 }])
    assert.equal(shouldFillDiscovery({ ...short, ...change }), false);
});
test('Banging is compact, defers its carousel and isolates photo swipes from venue scrolling', () => {
  const drawer = readFileSync(new URL('../components/BangingDrawer.tsx', import.meta.url), 'utf8');
  assert.match(drawer, /DRAWER_OPEN_HEIGHT = 272/);
  assert.match(drawer, /DRAWER_CLOSED_HEIGHT = 44/);
  assert.match(drawer, /carouselVisible \? <FlatList/);
  assert.match(drawer, /scrollEnabled=\{!photoInteracting\}/);
  const photo = readFileSync(new URL('../components/VenuePhoto.tsx', import.meta.url), 'utf8');
  assert.match(photo, /photo-next|photo-\$\{direction/);
  assert.match(photo, /onTouchCancel/);
  assert.doesNotMatch(photo, /firstPartyGallery = Boolean\(venue.promoted \|\| venue.banging/);
});
