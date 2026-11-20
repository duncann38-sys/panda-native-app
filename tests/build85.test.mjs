import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadTypeScriptModule(path) {
  const source = await read(path);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('APK 85 has a new Android version code and branch-only EAS build', async () => {
  const app = JSON.parse(await read('app.json'));
  const workflow = await read('.eas/workflows/panda-build-85.yml');
  assert.equal(app.expo.android.versionCode, 85);
  assert.match(workflow, /panda-build-85/);
  assert.match(workflow, /profile: preview/);
  assert.match(workflow, /platform: android/);
});

test('local weather asks use device location but named destinations do not', async () => {
  const { requiresCurrentLocation, isWeatherIntent } = await loadTypeScriptModule('utils/location-intent.ts');
  const general = text => /^(?:what is|when|who)/i.test(text);
  const transit = () => false;

  for (const query of ['What is the weather?', 'Will it rain tomorrow?', 'Weather near me']) {
    assert.equal(isWeatherIntent(query), true);
    assert.equal(requiresCurrentLocation(query, general, transit), true, query);
  }
  for (const query of ['What is the weather in Malmö?', 'Will it rain in Tokyo tomorrow?']) {
    assert.equal(requiresCurrentLocation(query, general, transit), false, query);
  }
});

test('event source links allow only unique HTTPS URLs and derive their displayed domain', async () => {
  const { safeAiSources } = await loadTypeScriptModule('utils/ai-source-links.ts');
  const sources = safeAiSources([
    { title: 'Official tickets', url: 'https://www.ticketmaster.com/artist' },
    { title: 'Duplicate', url: 'https://www.ticketmaster.com/artist' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'Credentials', url: 'https://user:pass@example.com/path' },
    { title: 'Insecure', url: 'http://example.com/show' },
  ]);
  assert.deepEqual(sources, [{
    title: 'Official tickets',
    url: 'https://www.ticketmaster.com/artist',
    domain: 'ticketmaster.com',
  }]);
});

test('Panda keeps its hospitality-first caring voice and renders web-grounded show links', async () => {
  const prompt = await read('utils/concierge-conversation.ts');
  const screen = await read('app/ai.tsx');
  assert.match(prompt, /Hospitality is your heart and default strength/);
  assert.match(prompt, /emojis when they add warmth, emotion, laughter or celebration/);
  assert.match(screen, /LIVE SHOW SOURCES/);
  assert.match(screen, /Linking\.openURL\(source\.url\)/);
});
