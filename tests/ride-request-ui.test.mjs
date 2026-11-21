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
  assert.match(screen, /PANDA RIDE · ESTIMATE ONLY/);
  assert.match(screen, /FROM · YOUR CURRENT LOCATION/);
  assert.match(screen, /PANDA ESTIMATE/);
  assert.match(screen, /Open Uber · check live fare/);
  assert.match(screen, /No ride booked/);
  assert.doesNotMatch(screen, /Getting your current location…/);
  assert.match(screen, /<UberHomeSuggestion/);
  assert.match(screen, /panda-ai-uber-home-shortcut/);
  assert.match(screen, /forceFresh: true/);
  assert.match(screen, /searchMode: 'nearby'/);
  assert.match(screen, /LIVE SOURCES/);
});

test('home destination coordinates are stored as validated private profile fields', async () => {
  const { parseProfilePreferences } = await loadTypeScriptModule('utils/profile-preferences.ts');
  const saved = parseProfilePreferences(JSON.stringify({
    homeAddress: '10 Downing Street, London',
    homeLatitude: 51.5034,
    homeLongitude: -0.1276,
  }));
  assert.equal(saved.homeAddress, '10 Downing Street, London');
  assert.equal(saved.homeLatitude, 51.5034);
  assert.equal(saved.homeLongitude, -0.1276);
  const invalid = parseProfilePreferences(JSON.stringify({
    homeAddress: 'Somewhere',
    homeLatitude: 999,
    homeLongitude: Infinity,
  }));
  assert.equal(invalid.homeLatitude, null);
  assert.equal(invalid.homeLongitude, null);
});

test('profile home-address editor and current-location context transpile cleanly', async () => {
  for (const path of [
    'app/(tabs)/profile.tsx',
    'context/live-venues.tsx',
    'utils/profile-preferences-store.ts',
  ]) {
    const source = await read(path);
    const result = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    assert.deepEqual(
      (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error),
      [],
      `${path} should parse and transpile`,
    );
  }
  const profile = await read('app/(tabs)/profile.tsx');
  assert.match(profile, /Home for Uber/);
  assert.match(profile, /Location\.geocodeAsync/);
  assert.match(profile, /Panda won’t send this address to its chat service/);
});
