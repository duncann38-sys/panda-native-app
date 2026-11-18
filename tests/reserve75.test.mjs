import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');
const modules = new Map();
async function load(path, fetchImpl = async () => { throw new Error('Unexpected network'); }) {
  const text = await source(path);
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', js)(exports, name => {
    if (name === '@/constants/services') return { PANDA_RUNTIME_API: 'https://panda-ai-proxy.vercel.app' };
    if (name === './google-place-eligibility') return { isGooglePlaceVenue: v => /^[A-Za-z0-9_-]{8,256}$/.test(v?.id ?? '') };
    if (modules.has(name)) return modules.get(name);
    throw new Error(`Unexpected import: ${name}`);
  }, fetchImpl);
  return exports;
}
modules.set('./official-venue-links', await load('utils/official-venue-links.ts'));
const { getReservationTarget: target } = await load('utils/reservation-target.ts');
const official = url => ({ source: 'official_website', lookupStatus: 'verified', reservationUrl: url, website: 'https://venue.example/' });
test('verified OpenTable restaurant pages open as OpenTable, not generic venue booking', () => {
  assert.equal(target(official('https://www.opentable.co.uk/r/test-restaurant-london')).provider, 'opentable');
  assert.equal(target(official('https://www.opentable.com/booking/restref/client/?rid=123')).provider, 'opentable');
});
test('legitimate alternative booking providers are retained and labelled accurately', () => {
  assert.equal(target(official('https://www.sevenrooms.com/reservations/example')).provider, 'venue');
});
test('homepages, unsafe URLs, fake OpenTable hosts and search pages fail closed', () => {
  for (const url of ['https://venue.example/', 'javascript:alert(1)', 'https://maps.app.goo.gl/abc',
    'https://www.opentable.co.uk/search', 'http://opentable.co.uk/r/example',
    'https://opentable.co.uk.evil.example/r/example', 'https://localhost/r/example']) {
    assert.equal(target(official(url)).provider, 'unavailable', url);
  }
});
test('directory links require a current production proof with the correct RID', () => {
  const links = { ...official('https://www.opentable.com/booking/restref/client/?rid=123'),
    reservationSource: 'opentable_directory',
    openTableMatch: { placeId: 'ChIJExample', rid: 123, environment: 'production', expiresAt: Date.now() + 100000 } };
  assert.equal(target(links).provenance, 'opentable_directory');
  assert.equal(target({ ...links, openTableMatch: { ...links.openTableMatch, rid: 456 } }).provider, 'unavailable');
  assert.equal(target({ ...links, openTableMatch: { ...links.openTableMatch, expiresAt: 0 } }).provider, 'unavailable');
  assert.equal(target({ ...links, openTableMatch: { ...links.openTableMatch, environment: 'sandbox' } }).provider, 'unavailable');
});
test('Reserve requests use explicit reservation intent and preserve current API compatibility', async () => {
  let requested;
  const { loadOfficialVenueLinks } = await load('utils/official-venue-links.ts', async url => {
    requested = url;
    return { ok: true, json: async () => ({ source: 'official_website', website: 'https://venue.example/',
      reservationUrl: 'https://sevenrooms.com/reservations/example' }) };
  });
  const links = await loadOfficialVenueLinks('ChIJExampleVenue', new AbortController().signal, undefined, 'reservation');
  assert.match(requested, /\?intent=reservation$/);
  assert.equal(target(links).provider, 'venue');
});
test('a directory proof for another Google venue cannot enter the booking flow', async () => {
  const { loadOfficialVenueLinks } = await load('utils/official-venue-links.ts', async () => ({
    ok: true, json: async () => ({ ...official('https://www.opentable.co.uk/r/test-restaurant'),
      reservationSource: 'opentable_directory', openTableMatch: { placeId: 'ChIJWrongVenue', rid: 123,
        environment: 'production', method: 'name_phone_coordinates', expiresAt: Date.now() + 100000 } }),
  }));
  assert.equal(target(await loadOfficialVenueLinks('ChIJExampleVenue', new AbortController().signal)).provider, 'unavailable');
});
test('Reserve opens the provider automatically without a Continue step or extra sign-in', async () => {
  const screen = await source('components/VenueReservationScreen.tsx');
  assert.match(screen, /const showBrowser = Boolean\(target\?\.url\)/);
  assert.doesNotMatch(screen, /reservation-continue|setBrowsing|Continue to|signInWith/);
  assert.match(screen, /if \(showBrowser && target\?\.url\) return/);
  assert.match(screen, /onPress=\{goBack\}/);
  assert.match(screen, /15_000/);
  assert.match(screen, /reservation-page-external/);
});
test('all six venue surfaces retain quick Reserve and originating analytics', async () => {
  assert.match(await source('components/DiscoverVenueCard.tsx'), /ReserveButton venue=\{venue\} activitySurface=\{activitySurface\}/);
  assert.match(await source('components/SuggestionRow.tsx'), /activitySurface=\{activitySurface\}/);
  assert.match(await source('app/(tabs)/saved.tsx'), /activitySurface="saved"/);
  assert.match(await source('components/VenueCard.tsx'), /editorial \? 'banging' : 'discovery'/);
  for (const [path, surface] of [['app/ai.tsx', 'panda_ai'], ['app/(tabs)/map.tsx', 'map'], ['components/PandaPlannerSheet.tsx', 'planner']]) {
    assert.match(await source(path), new RegExp(`activitySurface="${surface}"`));
  }
  const button = await source('components/ReserveButton.tsx');
  assert.doesNotMatch(button, /fetch\(|loadOfficialVenueLinks/);
  assert.match(button, /stopPropagation/);
  assert.match(button, /withVenueActivityContext/);
});
