import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const planner = await source('app/(tabs)/index.tsx');
const drawer = await source('components/BangingDrawer.tsx');
const card = await source('components/VenueCard.tsx');

test('Planner opens the exact tapped venue, even when it is not already in the plan', () => {
  const start = planner.indexOf('onOpenVenue={(venue, context)');
  const end = planner.indexOf('openRequest=', start);
  assert.ok(start >= 0 && end > start, 'planner venue route handler exists');
  const handler = planner.slice(start, end);
  assert.match(handler, /venueData:\s*JSON\.stringify\(venue\)/);
  assert.match(handler, /plannerVenues:\s*JSON\.stringify\(context\.plan\)/);
});

test('Banging restores APK 90 header and photo treatment without changing compact card height', () => {
  assert.match(drawer, /fontSize: 22,\s*lineHeight: 26/);
  assert.match(drawer, /fontSize: 18,\s*lineHeight: 22/);
  assert.match(card, /height=\{compact \? 100/);
  assert.match(card, /LinearGradient/);
  assert.match(card, /styles\.editorialShade/);
});
