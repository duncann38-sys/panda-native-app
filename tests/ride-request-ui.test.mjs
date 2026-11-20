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

test('explicit Uber requests ask the app to include the current pickup location', async () => {
  const { requiresCurrentLocation } = await loadTypeScriptModule('utils/location-intent.ts');
  const general = () => false;
  const transit = () => false;
  assert.equal(requiresCurrentLocation('Get me an Uber to the Ritz Hotel', general, transit), true);
  assert.equal(requiresCurrentLocation('Get me an Uber to The Ritz in London', general, transit), true);
});

test('ride requests render one destination-only Uber card instead of venue cards', async () => {
  const screen = await read('app/ai.tsx');
  const compiled = ts.transpileModule(screen, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(
    (compiled.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error),
    [],
  );
  assert.match(screen, /message\.role === 'model' && message\.rideRequest && message\.venues\?\.length/);
  assert.match(screen, /<UberJourneyCard venue=\{message\.venues\[0\]\} colors=\{colors\} \/>/);
  assert.match(screen, /PANDA RIDE PREVIEW/);
  assert.match(screen, /PICKUP · YOUR LOCATION/);
  assert.match(screen, /PANDA ESTIMATE/);
  assert.match(screen, /Continue in Uber/);
  assert.match(screen, /Nothing is booked yet/);
  assert.match(screen, /LIVE SOURCES/);
});
