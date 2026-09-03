export type DiscoveryCategory =
  | 'Indian'
  | 'Italian'
  | 'Chinese'
  | 'Spanish'
  | 'French'
  | 'British'
  | 'Japanese'
  | 'Mexican'
  | 'Turkish'
  | 'American'
  | 'Meat'
  | 'Bar'
  | 'Lebanese'
  | 'Thai'
  | 'Chicken'
  | 'Pizza'
  | 'Burgers'
  | 'Dessert'
  | 'Coffee'
  | 'Breakfast'
  | 'Lunch'
  | 'Brunch'
  | 'Bottomless'
  | 'Pubs'
  | 'Dinner'
  | 'Drinks'
  | 'Sports'
  | 'Live Music'
  | 'Nightlife'
  | 'Shops'
  | 'Places of Interest';

type GooglePlaceCategoryInput = {
  name: string;
  type: string;
  primaryType?: string;
  types?: string[];
  sourceQueries?: string[];
  hasMusic?: boolean;
};

const SHOP_TYPES = new Set([
  'candy_store',
  'convenience_store',
  'dessert_shop',
  'grocery_store',
  'ice_cream_shop',
  'liquor_store',
  'market',
  'shopping_mall',
  'store',
  'supermarket',
  'wine_store',
]);

const INTEREST_TYPES = new Set([
  'amusement_center',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'botanical_garden',
  'cultural_landmark',
  'garden',
  'historical_landmark',
  'historical_place',
  'marina',
  'monument',
  'museum',
  'national_park',
  'observation_deck',
  'park',
  'plaza',
  'tourist_attraction',
  'visitor_center',
  'zoo',
]);

const FOOD_SERVICE_TYPES = new Set([
  'bar',
  'breakfast_restaurant',
  'brunch_restaurant',
  'cafe',
  'coffee_shop',
  'dessert_restaurant',
  'fast_food_restaurant',
  'fine_dining_restaurant',
  'food_court',
  'hamburger_restaurant',
  'meal_delivery',
  'meal_takeaway',
  'night_club',
  'pub',
  'restaurant',
  'wine_bar',
]);

const CUISINE_TYPES: Array<[DiscoveryCategory, string[]]> = [
  ['Indian', ['indian_restaurant']],
  ['Italian', ['italian_restaurant']],
  ['Chinese', ['chinese_restaurant']],
  ['Spanish', ['spanish_restaurant']],
  ['French', ['french_restaurant']],
  ['British', ['british_restaurant']],
  ['Japanese', ['japanese_restaurant', 'sushi_restaurant']],
  ['Mexican', ['mexican_restaurant']],
  ['Turkish', ['turkish_restaurant']],
  ['American', ['american_restaurant']],
  ['Lebanese', ['lebanese_restaurant', 'middle_eastern_restaurant']],
  ['Thai', ['thai_restaurant']],
  ['Pizza', ['pizza_restaurant']],
  ['Burgers', ['hamburger_restaurant']],
];

function hasAny(types: Set<string>, candidates: Set<string>) {
  return [...types].some((type) => candidates.has(type));
}

export function classifyGooglePlace(input: GooglePlaceCategoryInput): {
  primary: 'Restaurant' | 'Bar' | 'Coffee' | 'Pub' | 'Shop' | 'Place of Interest';
  categories: DiscoveryCategory[];
} {
  const placeTypes = new Set((input.types ?? []).map((type) => type.toLowerCase()));
  const primaryType = (input.primaryType ?? input.types?.[0] ?? '').toLowerCase();
  const normalized = `${input.name} ${input.type} ${(input.types ?? []).join(' ')}`.toLowerCase();
  const sourceText = (input.sourceQueries ?? []).join(' ').toLowerCase();
  const hasFoodServiceType = hasAny(placeTypes, FOOD_SERVICE_TYPES)
    || /(?:restaurant|cafe|coffee|bar|pub|night club|food court|takeaway)/.test(input.type.toLowerCase());
  const primaryIsHospitality = FOOD_SERVICE_TYPES.has(primaryType)
    || /(?:restaurant|cafe|coffee|bar|pub|night club|food court|takeaway)/.test(input.type.toLowerCase());
  const primaryIsInterest = INTEREST_TYPES.has(primaryType);
  const primaryIsShop = SHOP_TYPES.has(primaryType) || primaryType === 'bakery';
  const isShop = hasAny(placeTypes, SHOP_TYPES)
    || (placeTypes.has('bakery') && !hasFoodServiceType);

  const categories = new Set<DiscoveryCategory>();
  // Hospitality wins when Google supplies both a service type and a broad
  // retail/landmark type. A restaurant inside a station or shopping centre
  // is still a restaurant; the parent place is not its category.
  if (!primaryIsHospitality && primaryIsInterest) {
    return { primary: 'Place of Interest', categories: ['Places of Interest'] };
  }
  if (!primaryIsHospitality && primaryIsShop) {
    return { primary: 'Shop', categories: ['Shops'] };
  }
  if (!hasFoodServiceType) {
    if (hasAny(placeTypes, INTEREST_TYPES)) {
      return { primary: 'Place of Interest', categories: ['Places of Interest'] };
    }
    if (isShop) {
      return { primary: 'Shop', categories: ['Shops'] };
    }
  }

  for (const [category, matchingTypes] of CUISINE_TYPES) {
    if (matchingTypes.some((type) => placeTypes.has(type))) categories.add(category);
  }

  if (placeTypes.has('steak_house') || /\b(?:steak|grill|barbecue|bbq|churrasco|roast)\b/.test(normalized)) {
    categories.add('Meat');
  }
  if (
    placeTypes.has('chicken_restaurant')
    || /\b(?:fried|grilled|roast)?\s*chicken\b/.test(normalized)
    || (hasFoodServiceType && /\bchicken\b/.test(sourceText))
  ) {
    categories.add('Chicken');
  }
  if (placeTypes.has('pizza_restaurant') || /\bpizza\b/.test(normalized)) categories.add('Pizza');
  if (placeTypes.has('hamburger_restaurant') || /\bburger\b/.test(normalized)) categories.add('Burgers');

  const isCoffee = placeTypes.has('cafe') || placeTypes.has('coffee_shop') || /\b(?:cafe|coffee)\b/.test(input.type.toLowerCase());
  const isPub = placeTypes.has('pub') || /\b(?:pub|gastropub)\b/.test(input.type.toLowerCase());
  const isBar = placeTypes.has('bar') || placeTypes.has('wine_bar') || /\b(?:bar|cocktail)\b/.test(input.type.toLowerCase());
  const isNightlife =
    placeTypes.has('night_club')
    || placeTypes.has('dance_hall')
    || placeTypes.has('event_venue')
    || placeTypes.has('performing_arts_theater');
  const isRestaurant = hasFoodServiceType && !isCoffee && !isPub && !isBar && !isNightlife;

  if (isCoffee) categories.add('Coffee');
  if (isPub) categories.add('Pubs');
  if (isBar) categories.add('Bar');
  if (isBar || isPub) categories.add('Drinks');
  if (
    isNightlife
    || (hasFoodServiceType && /\b(?:nightlife|clubs?|live music|sports bars?|entertainment)\b/.test(sourceText))
  ) {
    categories.add('Nightlife');
    categories.add('Drinks');
  }
  if (input.hasMusic || /\b(?:live music|music venue|concert|karaoke)\b/.test(normalized)) categories.add('Live Music');
  if (/\b(?:sports bar|football bar)\b/.test(normalized)) categories.add('Sports');
  if (
    placeTypes.has('dessert_restaurant')
    || placeTypes.has('dessert_shop')
    || placeTypes.has('ice_cream_shop')
    || placeTypes.has('bakery')
    || (/\b(?:dessert|cake|ice cream|patisserie)\b/.test(sourceText) && (hasFoodServiceType || isShop))
  ) categories.add('Dessert');
  if (
    placeTypes.has('breakfast_restaurant')
    || ((hasFoodServiceType || isCoffee) && /\b(?:breakfast|morning food)\b/.test(sourceText))
  ) {
    categories.add('Breakfast');
  }
  if (placeTypes.has('brunch_restaurant') || (hasFoodServiceType && /\bbrunch\b/.test(sourceText))) {
    categories.add('Brunch');
  }
  if (hasFoodServiceType && /\bbottomless\b/.test(normalized)) categories.add('Bottomless');
  if (isRestaurant || isCoffee || isPub) categories.add('Lunch');
  if (isRestaurant || isPub || isBar) categories.add('Dinner');

  if (!categories.size && hasFoodServiceType) {
    categories.add('Lunch');
    categories.add('Dinner');
  }

  const primary = isCoffee ? 'Coffee' : isPub ? 'Pub' : isBar || isNightlife ? 'Bar' : 'Restaurant';
  return { primary, categories: [...categories] };
}