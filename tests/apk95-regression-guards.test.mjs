import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Banging keeps verified Google photos through venue mapping and filtering', async () => {
  const planner = await read('../components/PandaPlannerSheet.tsx');
  const discovery = await read('../app/(tabs)/index.tsx');

  assert.match(planner, /photoNames: result\.photoNames/);
  assert.match(planner, /photoName: result\.photoNames\?\.\[0\]\?\.name/);
  assert.match(discovery, /Boolean\(venue\.photoNames\?\.length\)/);
});

test('planner venue cards open details while the directions action stays separate', async () => {
  const planner = await read('../components/PandaPlannerSheet.tsx');

  assert.match(
    planner,
    /accessibilityLabel=\{`Open \$\{venue\.name\}`\}\s+accessibilityRole="button"\s+onPress=\{\(\) => \{\s+setOpen\(false\);\s+onOpenVenue\(venue, \{ plan, mode, price, location \}\);/,
  );
  assert.match(
    planner,
    /accessibilityLabel=\{`Walking directions to \$\{venue\.name\}`\}[\s\S]{0,300}onOpenDirections\(venue, \{ plan, mode, price, location \}\)/,
  );
});

test('Panda AI hides the empty pending bubble and keeps one typing indicator', async () => {
  const ai = await read('../app/ai.tsx');

  assert.match(ai, /text: '' \},\s+\];/);
  assert.match(ai, /const visibleMessages = messages\.filter\([\s\S]{0,180}message\.requestId[\s\S]{0,100}message\.text\.trim\(\)/);
  assert.match(ai, /visibleMessages\.map\(/);
  assert.match(ai, /<ConciergeTypingIndicator/);
  assert.doesNotMatch(ai, /text: 'Panda is thinking…'/);
});

test('venue details safely handle profiles without Google highlights', async () => {
  const detail = await read('../app/venue/[id].tsx');

  assert.match(detail, /const googleHighlights = Array\.isArray\(googleProfile\?\.highlights\)/);
  assert.match(detail, /highlights: Array\.isArray\(safeProfile\.highlights\)/);
  assert.match(detail, /googleHighlights\.map\(\(highlight\)/);
  assert.match(detail, /String\(venue\.rating \?\? ''\)/);
});
