import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
async function load(path, fetchImpl = async () => { throw new Error('Unexpected network request'); }) {
  const text = await source(path);
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', js)(exports, (name) => {
    if (name === '@/constants/services') return { PANDA_RUNTIME_API: 'https://panda-ai-proxy.vercel.app' };
    throw new Error(`Unexpected runtime import: ${name}`);
  }, fetchImpl);
  return exports;
}

test('release is version 74, the existing package identity and an SDK 54 APK profile', async () => {
  const { expo } = JSON.parse(await source('app.json'));
  const { build } = JSON.parse(await source('eas.json'));
  assert.equal(expo.android.versionCode, 74);
  assert.equal(expo.android.package, 'com.panda.pandamobile');
  assert.equal(build.preview.android.buildType, 'apk');
  assert.equal(build.preview.android.image, 'ubuntu-24.04-jdk-17-ndk-r27b');
  assert.match(await source('.eas/workflows/panda-build-74.yml'), /panda-build-74-native-updates/);
});

test('working authentication, root providers, Metro and dependency lock remain unchanged from Build 73', async () => {
  const expected = {
    'context/auth.tsx': 'c38554090dbea2bb3f80ec54af906e4291cf04a8',
    'app/_layout.tsx': '9ea6b23f066fb4ee50f41ae3a0704d8a98064c97',
    'metro.config.js': '2ca8f81bc41f141384fba12aaaa5dfc2cc399d18',
    'package.json': 'bd41e5dc35a9195fd8881c643517aaba5bf42daa',
    'pnpm-lock.yaml': '968359f936bc0d057fcc57be4067cfcc1acaef95',
  };
  for (const [path, sha] of Object.entries(expected)) {
    const bytes = await readFile(new URL(path, root));
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), sha, path);
  }
});

test('credit name follows the current account and has a neutral missing-name fallback', async () => {
  const { creditCardholderName: name } = await load('utils/credit-availability.ts');
  assert.equal(name('  Alex   Example  '), 'ALEX EXAMPLE');
  assert.equal(name('Second Person'), 'SECOND PERSON');
  assert.equal(name(null), 'PANDA MEMBER');
  assert.equal(name(' '), 'PANDA MEMBER');
  assert.equal(name('x'.repeat(100)).length, 60);
});

test('credit preview cannot display an active balance, repayment plan or application', async () => {
  const credit = await source('app/(tabs)/credit.tsx');
  assert.match(credit, /creditCardholderName\(account\?\.name\)/);
  assert.match(credit, /credit-coming-soon/);
  assert.doesNotMatch(credit, /DUNCAN NYANZI|£1,000|£373|PANDA_CREDIT_APPLICATION_URL|12% flat rate/);
  assert.match(await source('app/(tabs)/profile.tsx'), /Coming Soon · card preview/);
});

test('Planner keeps existing verified-budget rules and no longer reselects on minor GPS jitter', async () => {
  const { knownPriceWithinBudget } = await load('utils/venue-actions.ts');
  assert.equal(knownPriceWithinBudget('', '££'), false);
  assert.equal(knownPriceWithinBudget(undefined, '££'), false);
  assert.equal(knownPriceWithinBudget('£££', '££'), false);
  assert.equal(knownPriceWithinBudget('£', '££'), true);
  const planner = await source('components/PandaPlannerSheet.tsx');
  assert.match(planner, /selectionKey = `\$\{choiceScope\}:\$\{shuffle\}`/);
  assert.match(planner, /verified\.expires > Date\.now\(\)/);
  assert.match(planner, /stablePlannerSelection/);
});

test('new Discovery pages cannot replace an unexpired selected itinerary', async () => {
  const { stablePlannerSelection } = await load('utils/planner-performance.ts');
  const first = stablePlannerSelection(null, 'same', [{ id: 'one' }], 1, [], 1000);
  assert.equal(stablePlannerSelection(first, 'same', [{ id: 'two' }], 1, [], 1001), first);
  assert.equal(stablePlannerSelection(first, 'changed', [{ id: 'two' }], 1, [], 1001).plan[0].id, 'two');
});

test('ordinary Google prices or publication dates cannot prove a current-month restaurant opening', async () => {
  const { hasDatedOpeningEvidence } = await load('utils/ai-openings.ts');
  const now = Date.parse('2026-11-18T10:00:00Z');
  const venue = { id: 'ChIJExampleVenue', openingSourceName: 'Official restaurant',
    openingSourceUrl: 'https://restaurant.example/opening', openingReportedAt: '2026-11-10T12:00:00Z', openingDate: '2026-11-10' };
  assert.equal(hasDatedOpeningEvidence(venue, now), true);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: undefined }, now), false);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: '2026-10-10' }, now), false);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: '2026-11-19' }, now), false);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingSourceUrl: 'http://restaurant.example' }, now), false);
});

test('official actions reject ticketed events and seasonal menus without rejecting ordinary booking handoffs', async () => {
  const { generalVenueActionUrl: action, officialPageUrl: safe } = await load('utils/official-venue-links.ts');
  assert.equal(action('https://venue.example/christmas-menu.pdf', 'menu'), undefined);
  assert.equal(action('https://tickets.example/movie-screening', 'reservation'), undefined);
  assert.equal(action('https://venue.example/a-la-carte.pdf', 'menu'), 'https://venue.example/a-la-carte.pdf');
  assert.equal(action('https://www.opentable.co.uk/r/example', 'reservation'), 'https://www.opentable.co.uk/r/example');
  assert.equal(safe('https://localhost/menu'), undefined);
  assert.equal(safe('https://127.0.0.1/menu'), undefined);
  assert.equal(safe('javascript:alert(1)'), undefined);
  assert.equal(safe('https://www.google.com/maps/search?q=menu'), undefined);
});

test('official link requests require the trusted source and never call a general website a menu', async () => {
  let requested = '';
  const { getOfficialVenueLinks } = await load('utils/official-venue-links.ts', async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ source: 'official_website', website: 'https://venue.example/',
      menuUrl: 'https://venue.example/', reservationUrl: 'https://tickets.example/movie-screening' }) };
  });
  const links = await getOfficialVenueLinks('ChIJSourceTest');
  assert.match(requested, /\/api\/partner\/venues\/ChIJSourceTest\/links$/);
  assert.equal(links.website, 'https://venue.example/');
  assert.equal(links.menuUrl, undefined);
  assert.equal(links.reservationUrl, undefined);
  const untrusted = await load('utils/official-venue-links.ts', async () => ({
    ok: true, json: async () => ({ source: 'search_result', menuUrl: 'https://venue.example/menu' }),
  }));
  assert.equal(await untrusted.getOfficialVenueLinks('ChIJUntrusted'), null);
});

test('website fallback stays labelled and Android PDF/browser recovery is preserved', async () => {
  const browser = await source('components/VenueBrowserScreen.tsx');
  assert.match(browser, /isWebsiteFallback \? 'Venue website'/);
  assert.match(browser, /A direct \$\{isMenu \? 'menu' : 'table-booking'\} link could not be verified/);
  assert.match(browser, /No booking has been made by Panda/);
  assert.match(browser, /androidPdf/);
  assert.match(browser, /WebBrowser\.openBrowserAsync/);
  assert.match(browser, /onRenderProcessGone/);
});

test('AI retains Android keyboard handling, reviewable dictation and visible night Send', async () => {
  const ai = await source('app/ai.tsx');
  assert.match(ai, /FlatList/);
  assert.match(ai, /useKeyboardState/);
  assert.match(ai, /ref=\{inputRef\}/);
  assert.match(ai, /backgroundColor: isNight \? colors\.gold : colors\.green900/);
  const voice = ai.slice(ai.indexOf('const startVoiceInput'), ai.indexOf('const openAiTransitDirections'));
  assert.doesNotMatch(voice, /sendMessage\(spokenText\)/);
  assert.match(voice, /Open keyboard/);
  assert.match(ai, /newOpeningsOnly: true/);
  assert.match(ai, /data\.newOpeningsSearch === true && hasDatedOpeningEvidence/);
});

test('Discovery pagination and map route markers remain explicit without changing the general map', async () => {
  assert.match(await source('app/(tabs)/index.tsx'), /testID="discovery-load-more"/);
  assert.match(await source('components/NativeGoogleMap.native.tsx'), /String\(routeIndex \+ 1\)/);
});
