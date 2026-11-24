import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/banging-rotation.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const banging = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const venue = (id, rating, premium = false) => ({
  id, name: id, category: 'Restaurant', rating: String(rating), premium,
  promoted: false, banging: true, bangingFallback: !premium,
});
const now = new Date(2026, 10, 24, 12, 0);

test('Banging prefers 4.5-plus venues and broadens with lower ratings when needed', () => {
  const results = banging.rotateBanging([
    venue('lower-44', 4.4), venue('high-46', 4.6), venue('lower-43', 4.3), venue('high-48', 4.8),
  ], now, 'rating-test');
  assert.equal(results.length, 4);
  assert.ok(results.slice(0, 2).every((item) => Number(item.rating) >= 4.5));
  assert.ok(results.slice(2).some((item) => Number(item.rating) < 4.5));
});

test('Premium cards still appear at the fifth slot', () => {
  const results = banging.rotateBanging([
    venue('high-a', 4.8), venue('high-b', 4.7), venue('high-c', 4.6), venue('high-d', 4.5), venue('premium', 4.4, true),
  ], now, 'premium-test');
  assert.equal(results[4]?.id, 'premium');
});
