export const LIVE_DISCOVERY_SEARCH_QUERIES: Record<string, string> = {
  All: 'restaurants bars cafes',
  Indian: 'indian restaurants',
  Italian: 'italian restaurants',
  Chinese: 'chinese restaurants',
  Spanish: 'spanish tapas',
  French: 'french restaurants',
  British: 'modern british restaurants',
  Japanese: 'japanese sushi',
  Mexican: 'mexican restaurants',
  Turkish: 'turkish restaurants',
  Pubs: 'gastropub pub food',
  American: 'american diner',
  Meat: 'steakhouses barbecue restaurants',
  Bar: 'bars cocktail bars',
  Lebanese: 'lebanese middle eastern',
  Thai: 'thai restaurants',
  Chicken: 'fried chicken',
  Pizza: 'pizza',
  Burgers: 'burger restaurants',
  Coffee: 'coffee shops cafe',
  Breakfast: 'breakfast',
  Lunch: 'lunch',
  Bottomless: 'bottomless brunch',
  Dinner: 'dinner restaurants',
  Drinks: 'cocktail bars wine bars',
  Sports: 'sports bars showing live football',
  'Live Music': 'live music venues bars',
  Nightlife: 'nightlife bars clubs',
  Shops: 'shops off licences and food stores',
  'Places of Interest': 'museums parks landmarks and tourist attractions',
};

export const LIVE_DISCOVERY_EXPANSION_RINGS_KM = [
  1.2, 2.4, 3.6, 4, 6, 8, 10, 12, 16, 20,
] as const;

export type LiveSearchCursor = {
  pageToken?: string;
  ringIndex: number;
};

export function liveDiscoverySearchQuery(category: string): string {
  return LIVE_DISCOVERY_SEARCH_QUERIES[category] ?? LIVE_DISCOVERY_SEARCH_QUERIES.All;
}

export function liveSearchRequest(cursor?: LiveSearchCursor): {
  pageToken?: string;
  expansionRingKm?: number;
} {
  if (!cursor) return {};
  if (cursor.pageToken) return { pageToken: cursor.pageToken };
  const expansionRingKm = LIVE_DISCOVERY_EXPANSION_RINGS_KM[cursor.ringIndex];
  return expansionRingKm === undefined ? {} : { expansionRingKm };
}

export function advanceLiveSearchCursor(
  cursor: LiveSearchCursor,
  nextPageToken?: string,
  usedExpansionRing = false,
): LiveSearchCursor | undefined {
  const ringIndex = cursor.ringIndex + (usedExpansionRing ? 1 : 0);
  if (nextPageToken) return { pageToken: nextPageToken, ringIndex };
  return ringIndex < LIVE_DISCOVERY_EXPANSION_RINGS_KM.length
    ? { ringIndex }
    : undefined;
}

export function hasMoreLiveSearch(cursor?: LiveSearchCursor): boolean {
  return Boolean(cursor && (cursor.pageToken || cursor.ringIndex < LIVE_DISCOVERY_EXPANSION_RINGS_KM.length));
}
