import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('APK 87 increments Android version and builds only from its release branch', async () => {
  const app = JSON.parse(await read('app.json'));
  const workflow = await read('.eas/workflows/panda-build-87.yml');
  assert.equal(app.expo.android.versionCode, 87);
  assert.match(workflow, /panda-build-87/);
  assert.match(workflow, /profile: preview/);
  assert.match(workflow, /platform: android/);
});
