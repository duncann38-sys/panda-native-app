import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import {
  buildChatInstruction, isGeneralLifeConversation as serverGeneral,
  isDirectVenueRequest, maySearchVenues, quickChatReply,
  shouldUseConversationalModel, wantsOpenNow,
} from '../../../prepared-fixes/panda-ai-personality/api/_panda-chat-policy.js';

const compiled = await build({
  entryPoints: [new URL('../utils/concierge-conversation.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const native = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const chat = text => [{ role: 'model', parts: [{ text }] }];

for (const text of [
  'Good morning', 'Be Nicer', 'Can you be funnier?', 'Tell me a joke',
  'I’m bored', 'How are you?', 'Can we just chat?', 'Thanks', 'That’s funny',
  'Make me smile', 'Can we talk something through?',
]) {
  test(`social reply uses conversation, not a venue search: ${text}`, () => {
    assert.equal(shouldUseConversationalModel(text), true);
    assert.equal(maySearchVenues(text), false);
    assert.equal(native.isPandaSocialTurn(text), true);
  });
}

for (const text of [
  'Help me plan my day', 'How can I feel more organised?',
  'Travel ideas for a weekend in Rome', 'I’ve had a rough day',
  'Help me decide what to do about work', 'Tell me about learning Italian',
]) {
  test(`life conversation needs neither a venue search nor location: ${text}`, () => {
    assert.equal(serverGeneral(text), true);
    assert.equal(native.isGeneralLifeConversation(text), true);
    assert.equal(maySearchVenues(text), false);
    assert.equal(isDirectVenueRequest(text), false);
  });
}

test('feelings do not block an explicitly requested venue search', () => {
  const text = 'I am stressed, find a quiet pub near me';
  assert.equal(serverGeneral(text), false);
  assert.equal(native.isGeneralLifeConversation(text), false);
  assert.equal(isDirectVenueRequest(text), true);
  assert.equal(maySearchVenues(text), true);
  assert.equal(isDirectVenueRequest('I love coffee'), false);
});

test('Panda name and explicitly saved personal context add to the existing concierge behaviour', () => {
  assert.equal(native.isPubOnlyConciergeRequest('Pubs near me'), true);
  assert.equal(native.isPubOnlyConciergeRequest('Plan a pub crawl'), true);
  assert.equal(native.isPubOnlyConciergeRequest('Pint'), true);
  assert.equal(native.isPubOnlyConciergeRequest('Pubs and cocktail bars'), false);
  assert.equal(native.isPubOnlyConciergeRequest('Restaurants near me'), false);
  const instruction = native.buildPandaPersonalInstruction('Duncan Nvanzi', ['loves live jazz']);
  assert.match(instruction, /Duncan/);
  assert.match(instruction, /loves live jazz/);
  assert.match(instruction, /affectionate sarcasm/i);
  assert.match(instruction, /not in every message/i);
});

test('weather replies use natural wording without changing provider-backed route data', () => {
  assert.equal(
    native.presentConciergeReplyText('The forecast from MET Norway shows no rain this afternoon.'),
    'The forecast shows no rain this afternoon.',
  );
  assert.equal(
    native.presentConciergeReplyText('According to MET Norway, it will be cloudy.'),
    'according to the forecast, it will be cloudy.',
  );
});

test('today questions use the device-local calendar instead of a guessed AI weekday', () => {
  assert.equal(
    native.localDateReply('What day and date is it today?', new Date('2026-11-22T12:00:00Z'), 'Europe/London'),
    'Today is Sunday, 22 November 2026.',
  );
  assert.equal(native.localDateReply('What day is the show?'), null);
});

test('quick safety replies are retained for rejection and booking acknowledgement', () => {
  assert.equal(shouldUseConversationalModel('No'), false);
  assert.equal(shouldUseConversationalModel('Okay', chat('Please review your reservation before you confirm.')), false);
  assert.match(quickChatReply('No', {}, chat('Please confirm your booking.')), /no action taken/);
});

test('outage greeting continues a morning conversation instead of pitching dancing', () => {
  const text = quickChatReply('Good morning', {timeZone:'Europe/London'},
    chat('Good morning. Coffee first, or a proper breakfast?'), new Date('2026-11-20T06:50:00Z'));
  assert.match(text, /gentle start|coffee/i);
  assert.doesNotMatch(text, /danc|dinner|Good morning!/i);
  assert.doesNotMatch(quickChatReply('Be nicer'), /apolog|fair point/i);
});

test('authoritative style is positive, broad, contextual and honest', () => {
  const prompt = buildChatInstruction([], {timeZone:'Europe/London'});
  for (const pattern of [/life concierge/i, /positive/i, /everyday decisions/i, /travel ideas/i,
    /not redirect/i, /recent exchange/i, /No stock/i, /one easy follow-up/i,
    /Never invent venues/i, /confirm requirements directly/i, /never pretend/i]) {
    assert.match(prompt, pattern);
  }
  assert.match(native.CONCIERGE_CONVERSATION_STYLE, /hospitality-only bot/);
  assert.match(native.CONCIERGE_CONVERSATION_STYLE, /positive/);
});

test('initial greeting welcomes broader conversation rather than offering only meals', async () => {
  const source = await readFile(new URL('../utils/concierge-session.ts', import.meta.url),'utf8');
  assert.match(source, /What’s on your mind/);
  assert.match(source, /thought to untangle, or just a chat/);
  assert.doesNotMatch(source, /Coffee first|Dinner, drinks|long lunch/);
});

for (const [query, expected] of [
  ['Coffee at this time near me', true],
  ['JUST WHATS OPEN', true],
  ['What’s open near me?', true],
  ['Open right now', true],
  ['Only open cafés nearby', true],
  ['Dinner tomorrow', false],
  ['Which cafés are open tomorrow?', false],
  ['Open restaurants tonight', false],
  ['What time does this café open?', false],
  ['What are its opening hours?', false],
  ['When does it close?', false],
  ['Cafés open at 9 tomorrow', false],
  ['Coffee nearby', false],
  ['Book OpenTable Sandbox — 264001', false],
]) {
  test(`client and API agree on current-open intent: ${query}`, () => {
    assert.equal(wantsOpenNow(query), expected);
    assert.equal(native.wantsOpenVenues(query), expected);
  });
}

test('only explicit provider-confirmed open venues survive initial and enriched selection', () => {
  const venues = [
    {id:'open', openNow:true}, {id:'closed', openNow:false},
    {id:'unknown', openNow:null}, {id:'missing'},
    {id:'text', openNow:'true'},
  ];
  assert.deepEqual(native.openVenueSelection(venues, true).map(v=>v.id), ['open']);
  assert.equal(native.openVenueSelection(venues, false), venues);
  assert.deepEqual(native.openVenueSelection([{id:'open',openNow:false}],true),[]);
});

test('native reply enrichment no longer appends a verified-hours paragraph', async () => {
  const source = await readFile(new URL('../app/ai.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source, /Today’s verified hours:|const verifiedHours/);
  assert.match(source, /openVenueSelection\(eligibleVenues, onlyOpenNow\)/);
  assert.match(source, /openVenueSelection\(enrichedVenues, onlyOpenNow\)/);
  assert.match(source, /!requestCoordinates && !isGeneralLifeConversation\(trimmed\)/);
  assert.match(source, /What’s on your mind/);
  assert.match(source, /Your life concierge/);
  assert.match(source, /message\.newSelection \? 20 : PANDA_AI_VENUE_LIMIT/);
});

test('API gates quick replies and applies open filtering through normal and error searches', async () => {
  const source = await readFile(new URL('../../../prepared-fixes/panda-ai-personality/api/panda-ai.js',import.meta.url),'utf8');
  assert.match(source, /quick&&!shouldUseConversationalModel/);
  assert.match(source, /!onlyOpenNow \|\| venue\.openNow === true/);
  assert.match(source, /candidates\.filter\(venue=>venue\.openNow===true\)/);
});
