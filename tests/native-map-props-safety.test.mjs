import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const nativeMap = readFileSync(new URL('../components/NativeGoogleMap.native.tsx', import.meta.url), 'utf8');
const discovery = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const bangingDrawer = readFileSync(new URL('../components/BangingDrawer.tsx', import.meta.url), 'utf8');
const partnerVenues = readFileSync(new URL('../utils/partner-venues.ts', import.meta.url), 'utf8');
const liveVenues = readFileSync(new URL('../context/live-venues.tsx', import.meta.url), 'utf8');
const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const releaseWorkflow = readFileSync(new URL('../.eas/workflows/panda-apk-100-venue-detail-restoration.yml', import.meta.url), 'utf8');

test('native map validates venue, user, and station coordinates before native props', () => {
  assert.match(nativeMap, /normalizeMapCoordinate\(userCoordinates\)/);
  assert.match(nativeMap, /safeVenueEntries\(venues\)/);
  assert.match(nativeMap, /safeVenueEntries\(routeVenues\)/);
  assert.match(nativeMap, /const safeStationData = safeStations\(stations\)/);
  assert.match(nativeMap, /initialRegion=\{\{\s*\.\.\.\(safeUserCoordinates \?\? selected \?\? LONDON\)/);
  assert.match(nativeMap, /coordinate=\{safeStationData\.origin\.coordinate\}/);
  assert.match(nativeMap, /coordinate=\{safeStationData\.destination\.coordinate\}/);
  assert.match(nativeMap, /coordinate=\{coordinate\}/);
  assert.doesNotMatch(nativeMap, /coordinate=\{stations\./);
});

test('category cache normalizes malformed rows and venue carousels use stable keys', () => {
  assert.match(discovery, /normalizeDiscoveryVenueList\(value\.venues\)/);
  assert.match(discovery, /normalizeDiscoveryVenueList\(liveVenues\)/);
  assert.match(discovery, /normalizeDiscoveryVenueList\(partners\?\.venues\)/);
  assert.match(discovery, /keyExtractor=\{\(item\) => item\.id\}/);
  assert.match(bangingDrawer, /normalizeBangingVenueList\(venues\)/);
  assert.match(bangingDrawer, /keyExtractor=\{\(venue\) => venue\.id\}/);
  assert.match(partnerVenues, /normalizePlacements\(body\)/);
  assert.match(partnerVenues, /normalizeProfile\(parsed, placement\.place_id\)/);
  assert.match(partnerVenues, /normalizeMapCoordinate\(profile\)/);
  assert.match(liveVenues, /normalizeMapCoordinate\(nextCoordinates\)/);
  assert.doesNotMatch(discovery, /firestore|collection\(/i);
});

test('venue card animations contain no Reanimated layout transitions', () => {
  const suggestionRow = readFileSync(new URL('../components/SuggestionRow.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(suggestionRow, /\b(?:layout|entering|exiting)\s*=/);
  assert.doesNotMatch(readFileSync(new URL('../components/VenueCard.tsx', import.meta.url), 'utf8'), /\b(?:layout|entering|exiting)\s*=/);
});

test('APK 103 uses one branch-specific Android preview build', () => {
  assert.equal(appConfig.expo.android.versionCode, 103);
  assert.match(releaseWorkflow, /branches:\s*\n\s+- panda-apk-100-venue-detail-restoration/);
  assert.match(releaseWorkflow, /platform: android/);
  assert.match(releaseWorkflow, /profile: preview/);
});
