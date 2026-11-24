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
  promoted: false, banging: true, bangingFallback: !premium,
  latitude: 51.5, longitude: -0.1, luxurySource: 'google_primary_type:fine_dining_restaurant',
  bangingTransitMinutes: 45, bangingVerifiedAt: Date.now(),
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

test('Banging opens with dynamic upscale clusters, then expands to the full two-hour quality pool', () => {
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

  const firstOpen = banging.rotateBanging(source, now, 'first-open', 0).map(item => item.id);
  const secondOpen = banging.rotateBanging(source, now, 'second-open', 1).map(item => item.id);
  const thirdOpen = banging.rotateBanging(source, now, 'third-open', 2).map(item => item.id);
  const fourthOpen = banging.rotateBanging(source, now, 'fourth-open', 3).map(item => item.id);

  assert.deepEqual(new Set(firstOpen), new Set(['flagship-a', 'flagship-b', 'flagship-c']));
  assert.ok(secondOpen.includes('other-48'));
  assert.ok(!firstOpen.includes('other-48'));
  assert.ok(thirdOpen.includes('cluster-47'));
  assert.ok(fourthOpen.includes('wider-46'));
  assert.ok(fourthOpen.every(id => id !== 'fast-food-chain'));
});
