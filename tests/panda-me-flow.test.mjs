import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pandaMe = fs.readFileSync(new URL('../app/(tabs)/panda-me.tsx', import.meta.url), 'utf8');
const profile = fs.readFileSync(new URL('../app/(tabs)/profile.tsx', import.meta.url), 'utf8');
const tabs = fs.readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../app/(tabs)/map.tsx', import.meta.url), 'utf8');
const root = fs.readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const pandaMeData = fs.readFileSync(new URL('../utils/panda-me-firestore.ts', import.meta.url), 'utf8');

test('table plans use the live venue input and show validation inline', () => {
  assert.match(pandaMe, /venueNameRef\.current\.trim\(\)/);
  assert.match(pandaMe, /onChangeText=\{\(value\) => \{\s*venueNameRef\.current = value;/);
  assert.match(pandaMe, /tableValidationError/);
  assert.match(pandaMe, /DateTimePicker/);
});

test('My Favourites live in Panda Me and use the same real venue cards as saved listings', () => {
  assert.match(pandaMe, /title="My Favourites"/);
  assert.match(pandaMe, /savedSyncError/);
  assert.match(pandaMe, /<SuggestionRow/);
  assert.match(pandaMe, /buildLiveSavedVenue/);
  assert.doesNotMatch(profile, /title="Saved places"/);
});

test('a friend-saved place opens its venue card rather than sending the user to the map', () => {
  assert.match(pandaMe, /testID=\{`circle-saved-\$\{item\.placeId\}`\}/);
  assert.match(pandaMe, /pathname: '\/venue\/\[id\]'[\s\S]*?venueData: JSON\.stringify\(item\.venue\)/);
  assert.doesNotMatch(pandaMe, /onPress=\{\(\) => openPandaMap\(\)\}\s+style=\{styles\.pulseRow\}/);
});

test('incoming Panda messages use a sound/vibration channel and tap through to the right chat', () => {
  assert.match(root, /setNotificationChannelAsync\('panda-messages'/);
  assert.match(root, /notificationType === 'PANDA_MESSAGE'/);
  assert.match(root, /messageThreadId: threadId, notificationMessageId: messageId/);
  assert.match(pandaMe, /handledMessageNotification/);
  assert.match(pandaMe, /setActiveThread\(thread\);\s*setMessagesOpen\(true\)/);
  assert.match(pandaMeData, /api\/panda-message-notifications/);
  assert.match(profile, /Friend message alerts/);
  assert.match(profile, /Test message alert/);
});

test('the dedicated map tab is hidden and Panda Me can return from global map search', () => {
  assert.match(tabs, /name="map" options=\{\{ href: null \}\}/);
  assert.match(map, /Search places, food or areas|Searching Google Maps/);
  assert.match(map, /returnTo === 'panda-me'/);
});
