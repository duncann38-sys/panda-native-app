import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/venue/[id].tsx', import.meta.url), 'utf8');

test('opened venue details show the requested info and omit source attribution', () => {
  const start = source.indexOf('styles.editorialContext');
  const end = source.indexOf('{isNonHospitalityVenue(venue) ? <NonHospitalityActions', start);
  assert.ok(start >= 0 && end > start, 'opened-card details section exists');
  const openedCard = source.slice(start, end);
  assert.ok(source.includes('const displayedPrice = googleProfile?.price?.trim()'));
  assert.ok(source.includes('const displayedDescription = venue.description?.trim() || googleProfile?.editorialSummary?.trim()'));
  assert.match(source, /ratingCountLabel/);
  assert.match(openedCard, /displayedDescription/);
  assert.match(openedCard, /Panda Rating/);
  assert.match(openedCard, /Curated by Panda/);
  assert.doesNotMatch(openedCard, /sourceAttribution/);
});
