import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const row = await source('components/SuggestionRow.tsx');
const details = await source('app/venue/[id].tsx');
const fonts = await source('hooks/useVenueCardDesign.ts');

test('Discover keeps real photos, bounded ratings, full venue names and independent save/open controls', () => {
  assert.match(row, /<VenuePhoto venue=\{venue\}/);
  assert.match(row, /Number\.isFinite\(rating\) && rating > 0 && rating <= 5/);
  assert.match(row, /onPress=\{onPress\}/);
  assert.match(row, /onPress=\{\(\) => \{ recordVenueActivity\('save_click', venue, activitySurface\); onToggleSaved\(\); \}\}/);
  assert.match(row, /<Text numberOfLines=\{2\} style=\{\[styles\.name/);
  assert.match(row, /accessibilityState=\{\{ selected: saved \}\}/);
  assert.match(row, /Remove \$\{venue\.name\} from saved venues/);
  assert.match(row, /ReduceMotion\.System/);
  assert.doesNotMatch(row, /previewVenues|fetch\(|Uber|m\.uber\.com/);
});

test('Premium is disclosed conditionally and no sample facts are copied into Native', () => {
  assert.match(row, /venue\.promoted &&[\s\S]*PANDA PREMIUM/);
  assert.match(details, /venue\.premium &&/);
  assert.doesNotMatch(details, /previewVenue|previewAction|preview only|A neighbourhood favourite/);
  assert.match(details, /venue\.neighborhood \|\| displayedType/);
});

test('the editorial detail retains live enrichments and real action handlers', () => {
  for (const retained of [
    'hydrateVenueDetails', 'fullCardOpenStatus', '<VenueWeatherCard',
    '<ConciergeTransitCard', 'googleHighlights.map', '<PhotoGallery',
    "openVenuePage('menu')", "openVenuePage('reservation')",
    'onPress={openWalkingDirections}', "recordVenueActivity('call_click', venue)",
    'tel:${venue.phone.replace',
  ]) assert.ok(details.includes(retained), retained);
  assert.match(details, /photos\.length > 1/);
  assert.match(details, /onPhotoTap=\{openGallery\}/);
  assert.match(details, /useVenueCardDesign\('light'\)/);
});

test('new bundled typography is scoped and has a usable failure fallback', async () => {
  assert.match(fonts, /fontsLoaded\s*\?/);
  assert.match(fonts, /display: 'serif'/);
  const root = await source('app/_layout.tsx');
  assert.doesNotMatch(root, /PandaVenueSerif|useVenueCardDesign/);
  for (const file of [
    'InstrumentSerif-Regular.ttf', 'DMSans-Medium.ttf', 'DMSans-Bold.ttf',
    'InstrumentSerif-OFL.txt', 'DMSans-OFL.txt',
  ]) assert.ok((await stat(new URL(`../assets/fonts/${file}`, import.meta.url))).size > 500);
});

test('shared compiled hooks resolve the Native renderer React singleton', () => {
  const require = createRequire(import.meta.url);
  const config = require('../metro.config.js');
  for (const platform of ['android', 'ios', 'web']) {
    for (const name of ['react', 'react/compiler-runtime', 'react/jsx-runtime']) {
      const resolved = config.resolver.resolveRequest(
        { originModulePath: new URL('../../../lib/api-client-react/src/generated/api.ts', import.meta.url).pathname },
        name,
        platform,
      );
      assert.equal(resolved.type, 'sourceFile');
      assert.equal(resolved.filePath, require.resolve(name));
    }
  }
});
