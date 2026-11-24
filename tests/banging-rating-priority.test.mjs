import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/banging-rotation.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const banging = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const venue = (id, rating, premium = false, extra = {}) => ({
  id, name: id, category: 'Restaurant', type: 'Fine Dining Restaurant',
  rating: String(rating), ratingCount: 300, price: '£££', premium,
  promoted: false, banging: true, bangingFallback: false,
  latitude: 51.5, longitude: -0.1, luxurySource: 'google_primary_type:fine_dining_restaurant',
  bangingTransitMinutes: 45, bangingVerifiedAt: now.getTime(),
  ...extra,
});
const now = new Date(2026, 10, 24, 12, 0);

test('Banging excludes venues below 4.5 and keeps the highest rating bands first', () => {
  const results = banging.rotateBanging([
    venue('lower-44', 4.4), venue('high-46', 4.6), venue('lower-43', 4.3), venue('high-48', 4.8),
  ], now, 'rating-test');
  assert.deepEqual(results.map(item => item.id), ['high-48', 'high-46']);
});

test('Premium cards still appear at the fifth slot', () => {
  const results = banging.rotateBanging([
    venue('high-a', 4.8), venue('high-b', 4.7), venue('high-c', 4.6), venue('high-d', 4.5), venue('premium', 4.4, true),
  ], now, 'premium-test');
  assert.equal(results[4]?.id, 'premium');
});

test('Banging shows all quality tiers on the first open, with flagship clusters ranked first', () => {
  const source = [
    venue('flagship-a', 4.9, false, { latitude: 53.4800, longitude: -2.2400 }),
    venue('flagship-b', 4.8, false, { latitude: 53.4804, longitude: -2.2401 }),
    venue('flagship-c', 4.8, false, { latitude: 53.4807, longitude: -2.2403 }),
    venue('other-48', 4.9, false, { latitude: 53.5000, longitude: -2.2400 }),
    venue('cluster-47', 4.7, false, { latitude: 53.4805, longitude: -2.2402 }),
    venue('wider-46', 4.6, false, { price: '££', latitude: 53.5200, longitude: -2.2400 }),
    venue('fast-food-chain', 4.9, false, {
      name: 'McDonald’s City Centre', type: 'Fast Food Restaurant',
      latitude: 53.4802, longitude: -2.2402,
    }),
  ];

  const firstOpen = banging.rotateBanging(source, now, 'first-open').map(item => item.id);

  assert.ok(firstOpen.includes('flagship-a'));
  assert.ok(firstOpen.includes('flagship-b'));
  assert.ok(firstOpen.includes('flagship-c'));
  assert.ok(firstOpen.includes('other-48'));
  assert.ok(firstOpen.includes('cluster-47'));
  assert.ok(firstOpen.includes('wider-46'));
  assert.ok(firstOpen.indexOf('flagship-a') < firstOpen.indexOf('wider-46'));
  assert.ok(firstOpen.every(id => id !== 'fast-food-chain'));
});

test('Banging produces a full 50-card deck with 40 organic and Premium every fifth', () => {
  const organic = Array.from({ length: 40 }, (_, index) =>
    venue(`organic-${index}`, 4.5 + (index % 6) / 10));
  const premium = Array.from({ length: 10 }, (_, index) =>
    venue(`premium-${index}`, 4.7, true, { promoted: true }));
  const results = banging.rotateBanging([...organic, ...premium], now, 'full-deck');

  assert.equal(results.length, 50);
  assert.equal(results.filter(item => item.premium).length, 10);
  results.forEach((item, index) => {
    assert.equal(item.premium, (index + 1) % 5 === 0);
  });
});

test('stored estimated venues keep flagship ranking and still fill Premium fifth slots', () => {
  const stored = Array.from({ length: 40 }, (_, index) =>
    venue(`stored-${index}`, index < 3 ? 4.9 - index / 10 : 4.6, false, {
      bangingFallback: true,
      bangingFallbackSource: 'storage',
      bangingTransitEstimated: true,
      bangingTransitMinutes: 25 + index,
      bangingVerifiedAt: undefined,
      latitude: 51.5 + (index % 3) / 1000,
      longitude: -0.1 + (index % 3) / 1000,
    }));
  const premium = Array.from({ length: 10 }, (_, index) =>
    venue(`stored-premium-${index}`, 4.7, true, { promoted: true }));

  const deck = banging.rotateBanging([...stored, ...premium], now, 'stored-fallback');

  assert.equal(deck.length, 50);
  assert.equal(deck[0].id, 'stored-0');
  deck.forEach((item, index) => {
    assert.equal(item.premium, (index + 1) % 5 === 0);
  });
});
