import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const read = path => fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
async function loadTypeScript(path) {
  const source = await read(path);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
}
test('explicit Uber destinations refresh pickup location and render a ride-only card', async () => {
  const ai = await read('app/ai.tsx');
  const locationIntentSource = await read('utils/location-intent.ts');
  const estimate = await loadTypeScript('utils/uber-estimate.ts');
  assert.equal(estimate.isUberRideRequest('Get me an Uber to The Savoy'), true);
  assert.equal(estimate.isUberRideRequest('How much is an Uber to the Ritz?'), true);
  assert.match(locationIntentSource, /if \(isUberRideRequest\(text\)\) return true/);
  assert.match(ai, /const isUberRequest = isUberRideRequest\(trimmed\)/);
  assert.match(ai, /if \(isUberRequest \|\|/);
  assert.match(ai, /message\.role === 'model' && message\.rideRequest && message\.venues\?\.length/);
  assert.match(ai, /<UberJourneyCard venue=\{message\.venues\[0\]\} colors=\{colors\} \/>/);
  for (const label of ['PANDA RIDE · ESTIMATE ONLY', 'FROM · YOUR CURRENT LOCATION', 'PANDA ESTIMATE', 'Open Uber · check live fare', 'No ride booked']) assert.ok(ai.includes(label), label);
  const compiled = ts.transpileModule(ai, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.deepEqual((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error), []);
});
test('Uber home uses the saved private address locally and has a Panda AI shortcut', async () => {
  const ai = await read('app/ai.tsx');
  const start = ai.indexOf('const sendUberHome');
  const end = ai.indexOf('const sendMessage', start);
  const homeHandler = ai.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(homeHandler, /PANDA_AI_URL|fetchWithTimeout|fetch\(/);
  assert.match(ai, /testID="panda-ai-uber-home-shortcut"/);
  assert.match(ai, /Panda keeps it on this device and won’t send it to chat/);
  assert.match(ai, /refreshLocation\(true\)/);
});
test('home profile storage continues to validate private coordinates', async () => {
  const profile = await read('utils/profile-preferences.ts');
  assert.match(profile, /homeLatitude/);
  assert.match(profile, /homeLongitude/);
  assert.match(profile, /Math\.abs\(parsed\.homeLatitude\) <= 90/);
  assert.match(profile, /Math\.abs\(parsed\.homeLongitude\) <= 180/);
});
