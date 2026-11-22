import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('APK 90 increments Android version and retains the approved release workflow', async () => {
  const app = JSON.parse(await read('app.json'));
  const workflow = await read('.eas/workflows/panda-build-88.yml');
  assert.equal(app.expo.android.versionCode, 90);
  assert.match(workflow, /panda-build-88/);
  assert.match(workflow, /profile: preview/);
  assert.match(workflow, /platform: android/);
  assert.match(workflow, /Panda 90/);
});

test('the one-device test alert opens New Openings without changing weekly alert routing', async () => {
  const profile = await read('app/(tabs)/profile.tsx');
  const layout = await read('app/_layout.tsx');
  assert.match(profile, /action: 'send-test'/);
  assert.match(profile, /fcmToken: deviceToken\.data/);
  assert.match(profile, /Send a test alert to this device/);
  assert.match(layout, /NEW_OPENINGS_WEEKLY_TEST/);
  assert.ok(layout.includes("router.push('/new-restaurants')"));
  assert.match(layout, /weeklyOpenings: String\(Date\.now\(\)\)/);
});
