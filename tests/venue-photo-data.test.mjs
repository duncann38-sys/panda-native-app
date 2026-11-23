import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [new URL('../utils/venue-photo-data.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { safeVenuePhotoData, safeVenuePhotoLimit } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

test('legacy venue records without photo collections do not throw or claim photos', () => {
  const safe = safeVenuePhotoData({
    id: 'legacy-place',
    name: 'Legacy place',
    photoAttributions: undefined,
    photoNames: undefined,
    photoUris: undefined,
  });

  assert.deepEqual(safe.photoAttributions, []);
  assert.deepEqual(safe.photoNames, []);
  assert.deepEqual(safe.photoUris, []);
  assert.equal(safeVenuePhotoLimit(safe), 0);
});

test('malformed photo collections are filtered and photo counts stay capped', () => {
  const safe = safeVenuePhotoData({
    id: 'mixed-place',
    name: 'Mixed place',
    photoAttributions: ['Verified photographer', null],
    photoNames: [null, { name: 'photo-name', attribution: 'Google' }, { name: 3, attribution: 'bad' }],
    photoUris: [null, { uri: '', attribution: '' }, { uri: 'https://images.example/photo.jpg' }],
    photoCount: 99,
  });

  assert.deepEqual(safe.photoAttributions, ['Verified photographer']);
  assert.deepEqual(safe.photoNames, [{ name: 'photo-name', attribution: 'Google' }]);
  assert.deepEqual(safe.photoUris, [{ uri: 'https://images.example/photo.jpg', attribution: '' }]);
  assert.equal(safeVenuePhotoLimit(safe), 10);
});
