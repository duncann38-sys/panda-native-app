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
  assert.equal(deck.length, 4);
  assert.ok(deck.some(item => item.id === 'paid-fallback'));
});

test('organic Banging results do not require photos or display copy', () => {
  const organic = venue('organic-no-photo', { photoNames: [], description: '', feature: '' });
  assert.ok(rotateBanging([organic], now).some(item => item.id === 'organic-no-photo'));
});
