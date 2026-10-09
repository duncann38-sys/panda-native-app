type DiscoveryPageLike = {
  venues: unknown[];
  failure?: { code: string };
};

// Publish the small first response before starting the broader batch. Each
// query is scheduled once; a provider budget/auth failure stops expansion.
export async function loadProgressiveDiscovery<Page extends DiscoveryPageLike>(options: {
  queries: readonly string[];
  loadFirst: (query: string) => Promise<Page>;
  loadMore: (queries: readonly string[]) => Promise<Page>;
  onResults: (pages: Page[], complete: boolean) => Promise<void> | void;
  isCurrent: () => boolean;
}): Promise<void> {
  if (!options.queries.length || !options.isCurrent()) return;
  const first = await options.loadFirst(options.queries[0]);
  if (!options.isCurrent()) return;
  const stop = ['API-QUOTA', 'API-FORBIDDEN', 'API-RATE-LIMIT']
    .includes(first.failure?.code ?? '');
  const remaining = options.queries.slice(1);
  await options.onResults([first], stop || remaining.length === 0);
  if (stop || !remaining.length || !options.isCurrent()) return;
  const more = await options.loadMore(remaining);
  if (!options.isCurrent()) return;
  await options.onResults([first, more], true);
}
