import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../utils/uber-estimate.ts', import.meta.url), 'utf8');
const built = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildUberEstimate, isUberHomeRequest, isUberRideRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(built).toString('base64')}`,
);

test('builds an indicative estimate locally from distance and safe coordinates', () => {
  const estimate = buildUberEstimate({
    latitude: 51.465,
    longitude: -0.16,
    distanceMeters: 1200,
    venueName: 'Nine Elms Tavern',
    now: new Date('2026-11-23T12:00:00.000Z'),
    timeZone: 'Europe/London',
  });

  assert.equal(estimate?.minutes, 7);
  assert.equal(estimate?.label, '~7 mins • £6–£10');
  assert.ok(estimate?.minFare && estimate.maxFare > estimate.minFare);
});

test('adds the agreed £5 estimate uplift during weekday pickup peaks', () => {
  const offPeak = buildUberEstimate({
    latitude: 51.465,
    longitude: -0.16,
    distanceMeters: 1200,
    venueName: 'Nine Elms Tavern',
    now: new Date('2026-11-23T12:00:00.000Z'),
    timeZone: 'Europe/London',
  });
  const peak = buildUberEstimate({
    latitude: 51.465,
    longitude: -0.16,
    distanceMeters: 1200,
    venueName: 'Nine Elms Tavern',
    now: new Date('2026-11-23T08:00:00.000Z'),
    timeZone: 'Europe/London',
  });

  assert.equal(peak?.peakSurcharge, 5);
  assert.equal(peak?.minFare, (offPeak?.minFare ?? 0) + 5);
  assert.equal(peak?.maxFare, (offPeak?.maxFare ?? 0) + 5);
});

test('recognizes explicit rides and keeps the saved-home request local', () => {
  assert.equal(isUberRideRequest('Get me an Uber to The Savoy'), true);
  assert.equal(isUberRideRequest('How much is an Uber to the Ritz?'), true);
  assert.equal(isUberHomeRequest('Get me an Uber home'), true);
  assert.equal(isUberHomeRequest('Find nearby bars'), false);
});

test('uses an explicit driving duration when one is provided', () => {
  const estimate = buildUberEstimate({
    latitude: 51.5,
    longitude: -0.12,
    distanceMeters: 1200,
    driveDurationMinutes: 15,
    venueName: 'Panda place',
  });

  assert.equal(estimate?.minutes, 15);
});

test('creates the Uber universal link with encoded dropoff coordinates and venue name', () => {
  const estimate = buildUberEstimate({
    latitude: 51.5,
    longitude: -0.12,
    distanceMeters: 800,
    venueName: 'Cafe & Co',
  });
  const url = new URL(estimate?.deepLink ?? '');

  assert.equal(url.origin, 'https://m.uber.com');
  assert.equal(url.searchParams.get('action'), 'setPickup');
  assert.equal(url.searchParams.get('pickup'), 'my_location');
  assert.equal(url.searchParams.get('dropoff[latitude]'), '51.5');
  assert.equal(url.searchParams.get('dropoff[longitude]'), '-0.12');
  assert.equal(url.searchParams.get('dropoff[nickname]'), 'Cafe & Co');
});

test('omits the ride action when coordinates or distance are unavailable or invalid', () => {
  assert.equal(
    buildUberEstimate({ longitude: -0.12, distanceMeters: 500, venueName: 'Panda place' }),
    null,
  );
  assert.equal(
    buildUberEstimate({
      latitude: 51.5,
      longitude: -0.12,
      distanceMeters: Number.NaN,
      venueName: 'Panda place',
    }),
    null,
  );
});
