import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(fetch) {
  const source = read('../utils/official-venue-links.ts')
    .replace(/import \{ PANDA_RUNTIME_API \} from [^;]+;/, 'const PANDA_RUNTIME_API = "https://panda.example";');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const timers = new Map();
  let timer = 0;
  vm.runInNewContext(compiled, {
    exports, URL, AbortController, fetch,
    setTimeout: (callback, ms) => { const id = ++timer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...exports, timers };
}
const ok = links => ({ ok: true, json: async () => links });

test('only valid official HTTP(S) links can enter the viewer', () => {
  const { officialPageUrl } = load(() => {});
  assert.equal(officialPageUrl('https://venue.example/menu.pdf'), 'https://venue.example/menu.pdf');
  for (const value of ['javascript:alert(1)', 'file:///tmp/menu', 'https://user:password@venue.example', 'not a url', null]) {
    assert.equal(officialPageUrl(value), undefined);
  }
});

test('menu lookups share pending requests and reuse successful official links', async () => {
  let calls = 0;
  let complete;
  const api = load(() => { calls++; return new Promise(resolve => { complete = resolve; }); });
  const first = api.getOfficialVenueLinks('venue-id');
  assert.equal(first, api.getOfficialVenueLinks('venue-id'));
  complete(ok({ menuUrl: 'https://venue.example/food', website: 'https://venue.example' }));
  assert.equal((await first).menuUrl, 'https://venue.example/food');
  await api.getOfficialVenueLinks('venue-id');
  assert.equal(calls, 1);
  assert.equal(api.timers.size, 0);
});

test('a failed lookup can retry and does not cache failure', async () => {
  let calls = 0;
  const api = load(async () => ++calls === 1 ? { ok: false } : ok({ menuUrl: 'https://venue.example/menu' }));
  assert.equal(await api.getOfficialVenueLinks('venue-id'), null);
  assert.equal((await api.getOfficialVenueLinks('venue-id')).menuUrl, 'https://venue.example/menu');
  assert.equal(calls, 2);
});

test('empty results never become a long-lived no-menu cache', async () => {
  let calls = 0;
  const api = load(async () => { calls++; return ok({ menuUrl: null, reservationUrl: null }); });
  await api.getOfficialVenueLinks('venue-id');
  await api.getOfficialVenueLinks('venue-id');
  assert.equal(calls, 2);
});

test('a menu tap can refresh a partially cached booking-only result', async () => {
  let calls = 0;
  const api = load(async () => ++calls === 1
    ? ok({ reservationUrl: 'https://venue.example/book' })
    : ok({ reservationUrl: 'https://venue.example/book', menuUrl: 'https://venue.example/menu' }));
  assert.equal((await api.getOfficialVenueLinks('venue-id')).menuUrl, undefined);
  assert.equal((await api.getOfficialVenueLinks('venue-id', true)).menuUrl, 'https://venue.example/menu');
  assert.equal(calls, 2);
});

test('lookup aborts after twelve seconds and releases the pending slot', async () => {
  const api = load((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const request = api.getOfficialVenueLinks('venue-id');
  const deadline = [...api.timers.values()][0];
  assert.equal(deadline.ms, 12_000);
  deadline.callback();
  assert.equal(await request, null);
  assert.equal(api.timers.size, 0);
});

test('all Native menu entry points use the official resolver and shared viewer', () => {
  const detail = read('../app/venue/[id].tsx');
  const ai = read('../app/ai.tsx');
  for (const source of [detail, ai]) {
    assert.match(source, /getOfficialVenueLinks\(venue\.id/);
    assert.match(source, /\/venue\/\[id\]\/menu/);
  }
  assert.match(detail, /openingVenuePageRef\.current/);
  assert.match(ai, /menuOpeningRef\.current/);
  assert.match(read('../app/venue/[id]/menu.tsx'), /VenueBrowserScreen kind="menu"/);
});

test('viewer has bounded loading, real error/retry states and a persistent browser action', () => {
  const viewer = read('../components/VenueBrowserScreen.tsx');
  assert.match(viewer, /15_000/);
  assert.match(viewer, /onHttpError/);
  assert.match(viewer, /onError/);
  assert.match(viewer, /pandaPage === 'empty'/);
  assert.match(viewer, /Try again/);
  assert.match(viewer, /openBrowserAsync\(pageUrl/);
  assert.match(viewer, /androidPdf/);
  assert.doesNotMatch(viewer, /docs\.google\.com\/gview|bottomHint/);
});

test('gold treatment stays conditional on paid Premium and Banging badge is smaller', () => {
  const detail = read('../app/venue/[id].tsx');
  const card = read('../components/VenueCard.tsx');
  assert.match(detail, /venue\.premium && venue\.banging \? \[\s*styles\.paidPremiumLabel/);
  assert.match(detail, /venue\.premium && venue\.banging \? <View style=\{\[styles\.paidPremiumUnderline/);
  assert.match(card, /premiumTextStrong:\s*\{[\s\S]*?fontSize: 9,/);
  assert.match(card, /premiumBanging \? colors\.green900/);
});
