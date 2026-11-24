import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/venue-weather-display.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const weather = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));

test('weather night mode follows seasonal local-time cutoffs and 06:00 sunrise', () => {
  assert.equal(weather.venueWeatherNightStartHour(new Date(2026, 10, 24, 12)), 16);
  assert.equal(weather.venueWeatherNightStartHour(new Date(2026, 1, 24, 12)), 16);
  assert.equal(weather.venueWeatherNightStartHour(new Date(2026, 2, 24, 12)), 18);
  assert.equal(weather.venueWeatherNightStartHour(new Date(2026, 8, 24, 12)), 18);
  assert.equal(weather.venueWeatherNightStartHour(new Date(2026, 6, 24, 12)), 20);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 10, 24, 15, 59)), false);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 10, 24, 16, 0)), true);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 10, 24, 5, 59)), true);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 10, 24, 6, 0)), false);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 6, 24, 19, 59)), false);
  assert.equal(weather.isVenueWeatherNight(new Date(2026, 6, 24, 20, 0)), true);
});

test('night icons never reuse the daytime sun and describe clear, warm, mild, and wet nights', () => {
  const clear = weather.venueWeatherPresentation({ condition: 'Sunny', temperatureC: 22, emoji: '☀️' }, true);
  assert.equal(clear.condition, 'Warm night');
  assert.equal(clear.emoji, '🌙');
  assert.doesNotMatch(clear.emoji, /☀|🌞/);
  assert.equal(weather.venueWeatherPresentation({ condition: 'Clear', temperatureC: 16, emoji: '☀️' }, true).condition, 'Mild night');
  assert.equal(weather.venueWeatherPresentation({ condition: 'Light rain', temperatureC: 9, emoji: '🌧️' }, true).condition, 'Light rain tonight');
  assert.equal(weather.venueWeatherPresentation({ condition: 'Partly cloudy', temperatureC: 9, emoji: '☀️' }, true).emoji, '🌙☁️');
  assert.equal(weather.venueWeatherPresentation({ condition: 'Sunny', temperatureC: 22, emoji: '☀️' }, false).emoji, '☀️');
});
