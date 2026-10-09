import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProgressiveDiscovery } from '../utils/discovery-loading.ts';

const queries = ['restaurants', 'bars', 'cafes'];

test('publishes first venues before starting broader discovery, without repeating queries', async () => {
  const events = [];
  await loadProgressiveDiscovery({
    queries,
    loadFirst: async (query) => { events.push(['first', query]); return { venues: ['first venue'] }; },
    loadMore: async (remaining) => {
      assert.deepEqual(events[1], ['visible', ['first venue'], false]);
      events.push(['more', remaining]);
      return { venues: ['second venue'] };
    },
    onResults: (pages, complete) => events.push(['visible', pages.flatMap(p => p.venues), complete]),
    isCurrent: () => true,
  });
  assert.deepEqual(events, [
    ['first', 'restaurants'], ['visible', ['first venue'], false],
    ['more', ['bars', 'cafes']], ['visible', ['first venue', 'second venue'], true],
  ]);
});

for (const code of ['API-QUOTA', 'API-FORBIDDEN', 'API-RATE-LIMIT']) {
  test(`${code} stops expansion and does not retry`, async () => {
    const publications = [];
    await loadProgressiveDiscovery({
      queries,
      loadFirst: async () => ({ venues: [], failure: { code } }),
      loadMore: async () => assert.fail('Must not expand'),
      onResults: (pages, complete) => publications.push({ pages, complete }),
      isCurrent: () => true,
    });
    assert.equal(publications.length, 1);
    assert.equal(publications[0].complete, true);
  });
}

test('broader-request failure retains the first successful results', async () => {
  let last;
  await loadProgressiveDiscovery({
    queries,
    loadFirst: async () => ({ venues: ['first venue'] }),
    loadMore: async () => ({ venues: [], failure: { code: 'API-TIMEOUT' } }),
    onResults: (pages) => { last = pages; },
    isCurrent: () => true,
  });
  assert.deepEqual(last.flatMap(p => p.venues), ['first venue']);
});

test('empty first response still expands once', async () => {
  const publications = [];
  await loadProgressiveDiscovery({
    queries,
    loadFirst: async () => ({ venues: [] }),
    loadMore: async () => ({ venues: ['broader venue'] }),
    onResults: (pages, complete) => publications.push({ pages, complete }),
    isCurrent: () => true,
  });
  assert.equal(publications[0].complete, false);
  assert.deepEqual(publications[1].pages.flatMap(p => p.venues), ['broader venue']);
});

test('late results for an obsolete location are not published', async () => {
  let current = true;
  let publications = 0;
  await loadProgressiveDiscovery({
    queries,
    loadFirst: async () => { current = false; return { venues: ['wrong-area venue'] }; },
    loadMore: async () => assert.fail('Must not expand obsolete request'),
    onResults: () => { publications += 1; },
    isCurrent: () => current,
  });
  assert.equal(publications, 0);
});
