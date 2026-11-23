import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [new URL('../utils/venue-actions.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { interleavePromotions } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

const venue = (id, promoted = false) => ({ id, promoted });

test('promoted cards are distributed through the organic feed without being dropped', () => {
  const source = [
    ...Array.from({ length: 12 }, (_, index) => venue(`organic-${index}`)),
    ...Array.from({ length: 4 }, (_, index) => venue(`promoted-${index}`, true)),
  ];
  const result = interleavePromotions(source);
  assert.equal(result.length, source.length);
  assert.equal(result.filter((item) => item.promoted).length, 4);
  assert.ok(result.findIndex((item) => item.promoted) < 4);
  assert.deepEqual(
    result.filter((item) => item.promoted).map((item) => item.id),
    ['promoted-0', 'promoted-1', 'promoted-2', 'promoted-3'],
  );
});

test('a short organic list never silently hides remaining partner cards', () => {
  const source = [venue('organic-1'), venue('organic-2'), ...Array.from(
    { length: 5 },
    (_, index) => venue(`promoted-${index}`, true),
  )];
  const result = interleavePromotions(source);
  assert.equal(result.length, source.length);
  assert.equal(result.filter((item) => item.promoted).length, 5);
});
