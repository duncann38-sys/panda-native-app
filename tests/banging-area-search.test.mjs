import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('local storage Banging fallback displays immediately and recalculates estimated reach', async () => {
  const storage = new Map();
  const origin = { latitude: 51.483, longitude: -0.144 };
  const cacheKey = 'panda:banging:fallback:v1:51.48:-0.14';
  storage.set(cacheKey, JSON.stringify({
    expiresAt: Date.now() + 300_000,
    results: [
      {
        id: 'stored-nearby',
        name: 'Stored Fine Dining',
        type: 'Fine Dining Restaurant',
        category: 'Fine Dining Restaurant',
        price: '£££',
        rating: 4.8,
        ratingCount: 420,
        lat: 51.49,
        lng: -0.14,
        luxurySource: 'google_places_upscale_cluster',
      },
      {
        id: 'stored-too-far',
        name: 'Too Far Fine Dining',
        category: 'Fine Dining Restaurant',
        rating: 4.9,
        lat: 52,
        lng: -0.14,
        luxurySource: 'google_places_upscale_cluster',
      },
    ],
  }));
  let fetchStarted = false;
  const source = fs.readFileSync(new URL('../utils/banging-area-search.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const require = name => {
    if (name === '@/constants/services') return { PANDA_RUNTIME_API: 'https://example.test' };
    if (name === '@react-native-async-storage/async-storage') {
      return {
        __esModule: true,
        default: {
          getItem: async key => storage.get(key) ?? null,
          setItem: async (key, value) => storage.set(key, value),
          removeItem: async key => storage.delete(key),
        },
      };
    }
    throw new Error(`Unexpected import: ${name}`);
  };
  vm.runInNewContext(compiled, {
    AbortController,
    clearTimeout,
    Date,
    exports: module.exports,
    fetch: async () => {
      fetchStarted = true;
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        ok: true,
        json: async () => ({
          results: [],
          premiumJourneys: {},
          complete: false,
          expiresAt: Date.now() + 5_000,
          travelMode: 'transit',
        }),
      };
    },
    JSON,
    Map,
    module,
    Number,
    Promise,
    require,
    setTimeout,
    URLSearchParams,
  });

  const result = await Promise.race([
    module.exports.readBangingDeviceCache(origin),
    new Promise((_, reject) => setTimeout(() => reject(new Error('local cache was not immediate')), 30)),
  ]);

  assert.equal(fetchStarted, false);
  assert.equal(result.fallbackReason, 'local_storage_cache');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, 'stored-nearby');
  assert.equal(result.results[0].bangingTransitEstimated, true);
  assert.equal(result.results[0].bangingVerifiedAt, undefined);
  assert.equal(result.results[0].bangingTransitMinutes, 17);
  assert.ok(result.results[0].bangingTransitMinutes < 120);
});


test('successful Google Banging results persist only to this device for fallback', async () => {
  const storage = new Map();
  const origin = { latitude: 51.483, longitude: -0.144 };
  const cacheKey = 'panda:banging:fallback:v1:51.48:-0.14';
  const source = fs.readFileSync(new URL('../utils/banging-area-search.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = name => {
    if (name === '@/constants/services') return { PANDA_RUNTIME_API: 'https://example.test' };
    if (name === '@react-native-async-storage/async-storage') return {
      __esModule: true,
      default: {
        getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => storage.set(key, value),
        removeItem: async key => storage.delete(key),
      },
    };
    throw new Error('Unexpected import: ' + name);
  };
  const live = {
    id: 'google-live', name: 'High End Restaurant', address: 'London', type: 'Fine Dining Restaurant',
    rating: 4.9, ratingCount: 420, price: '£££', lat: 51.49, lng: -0.14,
    luxurySource: 'google_places_upscale_cluster', bangingTransitMinutes: 17,
    bangingVerifiedAt: Date.now(),
  };
  vm.runInNewContext(compiled, {
    AbortController, clearTimeout, Date, exports: module.exports,
    fetch: async () => ({ ok: true, json: async () => ({
      results: [live], premiumJourneys: {}, complete: false,
      expiresAt: Date.now() + 60_000, travelMode: 'transit',
    }) }),
    JSON, Map, module, Number, Promise, require, setTimeout, URLSearchParams,
  });

  const response = await module.exports.getBangingAreaResults(origin);
  assert.equal(response.results[0].id, 'google-live');
  const stored = JSON.parse(storage.get(cacheKey));
  assert.equal(stored.results[0].id, 'google-live');
  assert.equal(stored.results[0].bangingFallback, undefined);
  const local = await module.exports.readBangingDeviceCache(origin);
  assert.equal(local.results[0].id, 'google-live');
  assert.equal(local.results[0].bangingFallbackSource, 'storage');
  assert.equal(local.results[0].bangingTransitEstimated, true);
});

test('server storage fallback is not copied into the device cache', async () => {
  const storage = new Map();
  const origin = { latitude: 51.483, longitude: -0.144 };
  const source = fs.readFileSync(new URL('../utils/banging-area-search.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const require = name => {
    if (name === '@/constants/services') return { PANDA_RUNTIME_API: 'https://example.test' };
    if (name === '@react-native-async-storage/async-storage') return {
      __esModule: true,
      default: {
        getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => storage.set(key, value),
        removeItem: async key => storage.delete(key),
      },
    };
    throw new Error('Unexpected import: ' + name);
  };
  const shared = {
    id: 'shared-record', name: 'Shared Restaurant', address: 'London', type: 'Fine Dining Restaurant',
    rating: 4.9, ratingCount: 420, price: '£££', lat: 51.49, lng: -0.14,
    luxurySource: 'google_places_upscale_cluster', bangingFallback: true,
    bangingFallbackSource: 'storage', bangingTransitMinutes: 17,
  };
  vm.runInNewContext(compiled, {
    AbortController, clearTimeout, Date, exports: module.exports,
    fetch: async () => ({ ok: true, json: async () => ({
      results: [shared], premiumJourneys: {}, complete: false,
      expiresAt: Date.now() + 60_000, travelMode: 'estimated', fallbackReason: 'server_storage',
    }) }),
    JSON, Map, module, Number, Promise, require, setTimeout, URLSearchParams,
  });

  const response = await module.exports.getBangingAreaResults(origin);
  assert.equal(response.results.length, 0);
  assert.equal(storage.size, 0);
});
