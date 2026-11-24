import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');

function loadTypeScript(relativePath) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(output, filename);
  return compiled.exports;
}

const { rotateBanging } = loadTypeScript('utils/banging-rotation.ts');
const { normalizeBangingVenueList } = loadTypeScript('utils/discovery-data-safety.ts');
const { minimalPartnerVenue } = loadTypeScript('utils/partner-venue-fallback.ts');
const { buildBangingFallbackCandidates, mergeBangingOrganicResults } = loadTypeScript('utils/banging-fallback.ts');
const now = new Date('2026-10-10T00:00:00Z');

function venue(id, extra = {}) {
  return {
    id, name: id, neighborhood: '', category: 'Restaurant', type: 'Restaurant',
    distance: '', walkingTime: '', rating: '4.6', ratingCount: 0, price: '',
    distanceMeters: 100, description: '', hours: '', feature: '', fullAddress: '',
    latitude: 51.5, longitude: -0.1, openNow: true, website: '', mapsUri: '',
    phone: '', premium: false, banging: true, promoted: false,
    photoAttributions: [], photoNames: [], luxurySource: 'curated-source',
    bangingTransitMinutes: 30, bangingVerifiedAt: now.getTime(), ...extra,
  };
}

test('partner placement becomes a usable venue card without enrichment', () => {
  const fallback = minimalPartnerVenue({
    place_id: 'ChIJpartner001',
    name: 'Brinkley’s',
    tier: 'banging',
  });
  assert.equal(fallback.name, 'Brinkley’s');
  assert.equal(fallback.banging, true);
  assert.equal(fallback.premium, true);
  assert.equal(fallback.photoNames.length, 0);
  assert.equal(fallback.description, '');
  assert.equal(fallback.latitude, undefined);
  assert.match(fallback.mapsUri, /query_place_id=ChIJpartner001/);
});

test('Banging card normalization accepts missing location and photo fields safely', () => {
  const result = normalizeBangingVenueList([{
    ...minimalPartnerVenue({ place_id: 'ChIJpartner002', name: 'Colbert', tier: 'banging' }),
    latitude: Number.NaN,
    longitude: null,
    photoNames: null,
    description: null,
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].latitude, undefined);
  assert.equal(result[0].longitude, undefined);
  assert.deepEqual(result[0].photoNames, []);
  assert.equal(result[0].description, '');
});

test('Premium placements remain visible with no route metadata', () => {
  const premium = venue('paid-without-route', {
    premium: true, promoted: true, bangingTransitMinutes: undefined, bangingVerifiedAt: undefined,
  });
  assert.deepEqual(rotateBanging([premium], now).map(item => item.id), ['paid-without-route']);
});

test('Premium cards stay fifth when the organic pool is large enough', () => {
  const organic = Array.from({ length: 50 }, (_, index) => venue(`organic-${index}`));
  const premium = Array.from({ length: 10 }, (_, index) => venue(`paid-${index}`, {
    premium: true, promoted: true, bangingTransitMinutes: undefined, bangingVerifiedAt: undefined,
  }));
  const deck = rotateBanging([...organic, ...premium], now);
  assert.equal(deck.length, 50);
  deck.forEach((item, index) => assert.equal(item.premium, (index + 1) % 5 === 0));
});

test('available partner cards prevent an empty drawer when fewer than four organic cards exist', () => {
  const organic = Array.from({ length: 3 }, (_, index) => venue(`few-${index}`));
  const premium = venue('paid-fallback', {
    premium: true, promoted: true, bangingTransitMinutes: undefined, bangingVerifiedAt: undefined,
  });
  const deck = rotateBanging([...organic, premium], now);
  assert.equal(deck.length, 3);
  assert.ok(deck.every(item => !item.premium));
});

test('organic Banging results do not require photos or display copy', () => {
  const organic = venue('organic-no-photo', { photoNames: [], description: '', feature: '' });
  assert.ok(rotateBanging([organic], now).some(item => item.id === 'organic-no-photo'));
});

test('organic Banging cards require 4.5+ restaurant results', () => {
  const belowFloor = venue('below-floor', { rating: '4.4' });
  const bar = venue('bar', { category: 'Bar' });
  assert.deepEqual(rotateBanging([belowFloor, bar], now), []);
});

test('fallback keeps only rated, geolocated local venues and never trusts coordinate-less London seeds', () => {
  const seeds = Array.from({ length: 31 }, (_, index) => venue(`seed-${index}`, {
    latitude: undefined,
    longitude: undefined,
    bangingTransitMinutes: undefined,
    bangingVerifiedAt: undefined,
    photoNames: [{ name: `old-photo-${index}`, attribution: 'Old photo' }],
  }));
  const live = Array.from({ length: 9 }, (_, index) => venue(`live-${index}`, {
    latitude: 51.5,
    longitude: -0.1,
    price: '£££',
    photoNames: [],
    bangingTransitMinutes: 20,
    bangingVerifiedAt: now.getTime(),
  }));
  const fallback = buildBangingFallbackCandidates(
    live,
    seeds,
    { latitude: 51.50, longitude: -0.10 },
  );
  assert.equal(fallback.length, 9);
  assert.ok(fallback.every(item => item.bangingFallback && item.banging && !item.premium));
  assert.equal(fallback.some(item => item.id.startsWith('seed-')), false);
  assert.equal(fallback.find(item => item.id === 'live-0').photoNames.length, 0);
  assert.equal(fallback.find(item => item.id === 'live-0').walkingTime, 'Travel details unavailable');
  assert.equal(fallback.find(item => item.id === 'live-0').bangingTransitMinutes, undefined);

  const premium = Array.from({ length: 10 }, (_, index) => venue(`paid-${index}`, {
    premium: true, promoted: true, bangingTransitMinutes: undefined, bangingVerifiedAt: undefined,
  }));
  const combined = mergeBangingOrganicResults([], fallback);
  const deck = rotateBanging([...combined, ...premium], now);
  assert.equal(deck.length, 11);
  deck.forEach((item, index) => {
    if ((index + 1) % 5 === 0) assert.equal(item.premium, true);
    else assert.equal(item.premium, false);
  });
});

test('live fallback requires a high-end nearby hospitality result and excludes active partners', () => {
  const live = [
    venue('high-end-no-photo', { latitude: 51.5, longitude: -0.1, price: '£££', photoNames: [] }),
    venue('below-rating-floor', { latitude: 51.5, longitude: -0.1, rating: '4.4', price: '£££' }),
    venue('ordinary', { latitude: 51.5, longitude: -0.1, price: '££', luxurySource: '' }),
    venue('far-away', { latitude: 52.5, longitude: -0.1, price: '£££', luxurySource: '' }),
  ];
  const fallback = buildBangingFallbackCandidates(
    live,
    [],
    { latitude: 51.5, longitude: -0.1 },
    new Set(['high-end-no-photo']),
  );
  assert.deepEqual(fallback, []);
  const visible = buildBangingFallbackCandidates(
    live,
    [],
    { latitude: 51.5, longitude: -0.1 },
  );
  assert.deepEqual(visible.map(item => item.id), ['high-end-no-photo']);
});

test('opening the drawer changes the order without lowering quality tiers', () => {
  const venues = Array.from({ length: 12 }, (_, index) => venue(`high-${index}`, {
    rating: index < 6 ? '4.8' : '4.6',
  }));
  const first = rotateBanging(venues, now, 'london-open-1');
  const second = rotateBanging(venues, now, 'london-open-2');
  assert.notDeepEqual(first.slice(0, 8).map(item => item.id), second.slice(0, 8).map(item => item.id));
  assert.ok(Number(first[0].rating) >= 4.6);
  assert.ok(Number(second[0].rating) >= 4.6);
});
