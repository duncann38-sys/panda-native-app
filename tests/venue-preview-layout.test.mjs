import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Banging and discovery share fixed preview geometry', () => {
  const layout = source('constants/venue-preview-layout.ts');
  const banging = source('components/BangingDrawer.tsx');
  const discovery = source('app/(tabs)/index.tsx');

  assert.match(layout, /VENUE_PREVIEW_CARD_HEIGHT\s*=\s*250/);
  assert.match(layout, /VENUE_PREVIEW_PHOTO_HEIGHT\s*=\s*100/);
  assert.match(layout, /VENUE_PREVIEW_CARD_MAX_WIDTH\s*=\s*194/);
  assert.match(banging, /bangingDrawerLayout\(measuredHeader,\s*VENUE_PREVIEW_CARD_HEIGHT,\s*48\)/);
  assert.match(banging, /keyExtractor=\{\(venue\)\s*=>\s*venue\.id\}/);
  assert.match(discovery, /testID="discovery-venue-carousel"/);
  assert.match(discovery, /horizontal/);
  assert.match(discovery, /keyExtractor=\{\(item\)\s*=>\s*item\.id\}/);
  assert.match(discovery, /presentation="banging"/);
});

test('compact previews reserve one-line names and stable status content', () => {
  const card = source('components/VenueCard.tsx');
  const photos = source('components/VenuePhoto.tsx');

  assert.match(card, /const compactPreview = compact && editorial/);
  assert.match(card, /numberOfLines=\{1\}\s+ellipsizeMode="tail"/);
  assert.match(card, /venue\.walkingTime \|\| venue\.distance/);
  assert.match(card, /compactPreview \? 0 : undefined/);
  assert.match(card, /compactPreview \? 'clean' : 'initial'/);
  assert.match(photos, /transition = 250/);
  assert.match(photos, /placeholderMode === 'clean'/);
});

test('Banging drawer no longer measures card content or leaves bottom padding', () => {
  const banging = source('components/BangingDrawer.tsx');
  const layout = source('utils/banging-drawer-layout.ts');

  assert.doesNotMatch(banging, /measure\('card'/);
  assert.doesNotMatch(banging, /onMomentumScrollEnd/);
  assert.match(banging, /paddingBottom:\s*0/);
  assert.match(layout, /carouselHeight\s*=\s*card\s*\+\s*4/);
});
