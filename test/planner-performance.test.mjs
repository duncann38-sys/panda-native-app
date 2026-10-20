import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlannerResourceCache, stablePlannerSelection } from '../utils/planner-performance.ts';

test('100 simultaneous requests for one profile or journey perform only one lookup', async () => {
  const cache = new PlannerResourceCache();
  let calls = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const load = async () => { calls++; await pending; return { durationMinutes: 18 }; };
  const requests = Array.from({ length: 100 }, () => cache.get('same-route', load));
  assert.ok(requests.every(request => request === requests[0]));
  finish();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.durationMinutes === 18));
  await cache.get('same-route', load);
  assert.equal(calls, 1);
});

test('verified cache entries expire without extending their lifetime on a cache hit', async () => {
  let now = 0, calls = 0;
  const cache = new PlannerResourceCache(100, () => now);
  const load = async () => ++calls;
  assert.equal(await cache.get('profile', load), 1);
  assert.equal(cache.expiresAt('profile'), 100);
  now = 90;
  assert.equal(await cache.get('profile', load), 1);
  assert.equal(cache.expiresAt('profile'), 100);
  now = 100;
  assert.equal(await cache.get('profile', load), 2);
  assert.equal(cache.expiresAt('profile'), 200);
});

test('failed or timed-out work is not cached and can be retried', async () => {
  const cache = new PlannerResourceCache();
  await assert.rejects(cache.get('retry', async () => { throw new Error('timeout'); }), /timeout/);
  assert.equal(cache.expiresAt('retry'), 0);
  assert.equal(await cache.get('retry', async () => 23), 23);
});

test('different journey limits and origin locations never share route proofs', async () => {
  const cache = new PlannerResourceCache();
  let calls = 0;
  await Promise.all(['a:b:40', 'a:b:60', 'origin:51.48:-0.14:a', 'origin:51.49:-0.14:a']
    .map(key => cache.get(key, async () => ++calls)));
  assert.equal(calls, 4);
});

const first = [{ id: 'dinner' }, { id: 'drinks' }, { id: 'late' }];
test('Discovery pages do not replace a complete plan while its checks are in progress', () => {
  const selected = stablePlannerSelection(null, 'night:area:££££:0', first, 3, [], 0);
  const update = stablePlannerSelection(selected, selected.key, [{ id: 'new-dinner' }], 3, [], 1);
  assert.strictEqual(update, selected);
  assert.deepEqual(update.plan, first);
});

test('area, budget, mode, shuffle, exclusions and expiry still replace an old selection', () => {
  const selected = stablePlannerSelection(null, 'night:area:££££:0', first, 3, [], 0);
  const newer = [{ id: 'replacement' }];
  for (const key of ['morning:area:££££:0', 'night:other:££££:0', 'night:area:££:0', 'night:area:££££:1']) {
    assert.deepEqual(stablePlannerSelection(selected, key, newer, 3, [], 1).plan, newer);
  }
  assert.deepEqual(stablePlannerSelection(selected, selected.key, newer, 3, ['drinks'], 1).plan, newer);
  assert.deepEqual(stablePlannerSelection(selected, selected.key, newer, 3, [], selected.expires).plan, newer);
});

test('incomplete selections can fill as real venues arrive', () => {
  const partial = stablePlannerSelection(null, 'morning', [first[0]], 2, [], 0);
  const complete = stablePlannerSelection(partial, 'morning', first.slice(0, 2), 2, [], 1);
  assert.equal(complete.plan.length, 2);
});

test('the planner keeps real budget, rating and all-pair journey checks and bounds every fetch', () => {
  const source = readFileSync(new URL('../components/PandaPlannerSheet.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bawait fetch\(/);
  assert.doesNotMatch(source, /120000|plannerVersion=1/);
  assert.match(source, /knownPriceWithinBudget\(profile\.price, price\)/);
  assert.match(source, /plannerVenueEligible\(/);
  assert.match(source, /second = first \+ 1/);
  assert.match(source, /route\.durationMinutes > \(isLateLeg \? 40 : 60\)/);
  assert.match(source, /route\.durationMinutes > 60/);
  assert.match(source, /remoteReadyScope === choiceScope && remoteLocation === searchArea/);
  assert.match(source, /if \(!open \|\| locationFocused\) return/);
  assert.match(source, /testID="planner-retry"/);
});
