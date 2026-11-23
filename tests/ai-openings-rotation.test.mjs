import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [new URL('../utils/ai-openings.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {
  advanceOpeningRotation,
  hasDatedOpeningEvidence,
  isNewOpeningPrompt,
  parseOpeningRotationState,
  rememberShownOpenings,
} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('New restaurants shortcut and typed new-opening requests use the same finder', () => {
  assert.equal(isNewOpeningPrompt('New restaurants near me'), true);
  assert.equal(isNewOpeningPrompt('Show me recently opened places'), true);
  assert.equal(isNewOpeningPrompt('Dinner tonight'), false);
});

test('opening cards require a Google venue and dated, secure named evidence within three months', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const venue = {
    id: 'ChIJopening',
    openingSourceName: 'Publisher',
    openingSourceUrl: 'https://example.com/new-opening',
    openingReportedAt: '2026-11-17',
    openingDate: '2026-11-12',
  };
  assert.equal(hasDatedOpeningEvidence(venue, now), true);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: '2026-10-30' }, now), true);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: '2026-08-01' }, now), true);
  assert.equal(hasDatedOpeningEvidence({ ...venue, openingDate: '2026-08-18' }, now), true);
  for (const patch of [
    { id: 'sample-venue' }, { openingSourceName: '' },
    { openingSourceUrl: 'javascript:alert(1)' }, { openingSourceUrl: 'http://example.com' },
    { openingSourceUrl: 'https://user:password@example.com' },
    { openingReportedAt: '' }, { openingReportedAt: 'invalid' }, { openingReportedAt: '2026-11-19' },
    { openingDate: '' }, { openingDate: '2026-07-31' }, { openingDate: '2026-11-19' },
    { openingDate: '2026-11-31' },
    { openingDate: undefined, openingDesignation: 'opentable-new' },
  ]) assert.equal(hasDatedOpeningEvidence({ ...venue, ...patch }, now), false);
});

test('rotation advances without clearing the device-local seen list', () => {
  const initial = { seenPlaceIds: ['ChIJalready-seen'], rotation: 2 };
  assert.deepEqual(advanceOpeningRotation(initial), {
    seenPlaceIds: ['ChIJalready-seen'],
    rotation: 3,
  });
});

test('shown opening IDs are deduplicated and invalid IDs are ignored', () => {
  const result = rememberShownOpenings(
    { seenPlaceIds: ['ChIJone'], rotation: 1 },
    ['ChIJone', 'ChIJtwo', '', 'bad id'],
  );
  assert.deepEqual(result, { seenPlaceIds: ['ChIJone', 'ChIJtwo'], rotation: 1 });
});

test('stored rotation state is bounded and malformed storage resets safely', () => {
  const ids = Array.from({ length: 140 }, (_, index) => `ChIJopening-${index}`);
  const parsed = parseOpeningRotationState(JSON.stringify({ seenPlaceIds: ids, rotation: 9 }));
  assert.equal(parsed.seenPlaceIds.length, 120);
  assert.equal(parsed.seenPlaceIds[0], 'ChIJopening-20');
  assert.equal(parsed.rotation, 9);
  assert.deepEqual(parseOpeningRotationState('{bad json'), { seenPlaceIds: [], rotation: 0 });
});
