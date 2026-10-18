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
  Pubs: 'pubs gastropubs beer gardens',
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
  Sports: 'sports bars showing football cricket darts and bowling',
  'Live Music': 'live music venues concert halls karaoke music bars',
  Nightlife: 'nightlife bars clubs dance halls karaoke',
  Shops: 'shops off licences supermarkets grocery stores',
  'Places of Interest': 'tourist attractions museums landmarks and art galleries',
};

export const LIVE_DISCOVERY_NEARBY_TYPES: Partial<Record<string, readonly string[]>> = {
  Pubs: ['pub', 'bar', 'beer_garden'],
  Sports: ['bar', 'sports_complex', 'bowling_alley', 'amusement_center'],
  Shops: ['supermarket', 'grocery_store', 'shopping_mall', 'convenience_store', 'store'],
  'Live Music': ['live_music_venue', 'concert_hall', 'karaoke', 'pub', 'bar', 'night_club', 'performing_arts_theater', 'amphitheatre'],
  Nightlife: ['night_club', 'bar', 'dance_hall', 'karaoke', 'bar_and_grill'],
  'Places of Interest': ['tourist_attraction', 'museum', 'historical_landmark', 'art_gallery', 'cultural_landmark', 'monument'],
  American: ['american_restaurant', 'bar_and_grill', 'fast_food_restaurant'],
  Lebanese: ['lebanese_restaurant', 'middle_eastern_restaurant', 'restaurant'],
  Thai: ['thai_restaurant', 'asian_restaurant'],
  Chicken: ['chicken_restaurant', 'fast_food_restaurant', 'restaurant'],
  Pizza: ['pizza_restaurant', 'italian_restaurant'],
  Burgers: ['hamburger_restaurant', 'fast_food_restaurant', 'restaurant'],
  Bottomless: ['brunch_restaurant', 'bar', 'restaurant'],
  Meat: ['steak_house', 'restaurant'],
  Coffee: ['coffee_shop', 'cafe'],
  Breakfast: ['breakfast_restaurant', 'cafe'],
  Dinner: ['restaurant'],
  Lunch: ['restaurant', 'cafe'],
  Drinks: ['bar', 'wine_bar'],
  Bar: ['bar', 'wine_bar'],
};

export function liveDiscoveryNearbyTypes(category: string): readonly string[] {
  return LIVE_DISCOVERY_NEARBY_TYPES[category] ?? [];
}

export const LIVE_DISCOVERY_EXPANSION_RINGS_KM = [8, 10, 12, 16, 20] as const;

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
  const effectiveRingKm = LIVE_DISCOVERY_EXPANSION_RINGS_KM[cursor.ringIndex];
  const expansionRingKm = effectiveRingKm === undefined ? undefined : effectiveRingKm - 1.5;
  return {
    ...(cursor.pageToken ? { pageToken: cursor.pageToken } : {}),
    ...(expansionRingKm !== undefined ? { expansionRingKm } : {}),
  };
}

export function advanceLiveSearchCursor(
  cursor: LiveSearchCursor,
  nextPageToken?: string,
  usedExpansionRing = false,
): LiveSearchCursor | undefined {
  if (nextPageToken) return { pageToken: nextPageToken, ringIndex: cursor.ringIndex };
  const ringIndex = cursor.ringIndex < 0
    ? 0
    : cursor.ringIndex + (usedExpansionRing ? 1 : 0);
  return ringIndex < LIVE_DISCOVERY_EXPANSION_RINGS_KM.length
    ? { ringIndex }
    : undefined;
}

export function hasMoreLiveSearch(cursor?: LiveSearchCursor): boolean {
  return Boolean(cursor && (cursor.pageToken || cursor.ringIndex < LIVE_DISCOVERY_EXPANSION_RINGS_KM.length));
}
