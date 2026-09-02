export type VenueCategory = 'Restaurant' | 'Bar' | 'Coffee' | 'Pub';

export type Venue = {
  id: string;
  name: string;
  neighborhood: string;
  category: VenueCategory;
  type: string;
  distance: string;
  walkingTime: string;
  rating: string;
  ratingCount: number;
  price: string;
  distanceMeters: number;
  description: string;
  hours: string;
  feature: string;
  fullAddress: string;
  openNow: boolean;
  website: string;
  mapsUri: string;
  phone: string;
  premium: boolean;
  banging: boolean;
  promoted: boolean;
  photoAttributions: string[];
};

type PremiumRotationSeed = readonly [
  id: string,
  name: string,
  type: string,
  rating: string,
  ratingCount: number,
  price: string,
  openNow: boolean,
  attribution: string,
];

const premiumRotationSeeds: PremiumRotationSeed[] = [
  ['ChIJZf2Jlc4EdkgRv83xDpKQfHA', 'Prezzo', 'Italian Restaurant', '4.5', 5863, '££', true, 'Prezzo'],
  ['ChIJL-HmB88EdkgRfH-wI_8ELLQ', 'Ekstedt at The Yard', 'Fine Dining Restaurant', '4.8', 763, '££££', false, 'Ekstedt at The Yard'],
  ['ChIJlciW4jsFdkgRvV8ezEeIcB8', 'Colonel Saab Trafalgar Square', 'Indian Restaurant', '4.8', 2081, '£££', true, 'Colonel Saab Trafalgar Square'],
  ['ChIJd_2m9pwFdkgRZNJ9puiVc_Q', 'Paper Moon Restaurant, Westminster', 'Italian Restaurant', '4.5', 322, '£££', true, 'Paper Moon Restaurant, London'],
  ['ChIJCXHRB9EEdkgRrOgHyE2YKbs', 'Wild Honey St James', 'Restaurant', '4.4', 1053, '££££', false, 'Wild Honey St James'],
  ['ChIJFzCP9dwFdkgRDIycGPUFhwY', "Whitcomb's", 'Restaurant', '4.7', 1143, '££', true, "Whitcomb's"],
  ['ChIJSzaWIDkFdkgRW97KH_V1dbE', 'Restaurant 45 St Martins Lane', 'French Restaurant', '4.6', 581, '££', true, 'Restaurant 45 St Martins Lane'],
  ['ChIJa0lD7foFdkgRbWHThMeKaCY', 'Claro London', 'Mediterranean Restaurant', '4.8', 579, '£££', true, 'Claro London'],
  ['ChIJr4SsXNEEdkgRK-Tjo-eEEl4', 'Scully', 'Fine Dining Restaurant', '4.8', 1381, '££££', true, 'David Velez'],
  ['ChIJSWN4ldUEdkgRGqo3OSnf1CY', 'Fallow', 'British Restaurant', '4.7', 13054, '£££', true, 'Fallow'],
  ['ChIJyeTsrLoFdkgRdsewS8ne0fQ', 'Blacklock Covent Garden', 'Steak House', '4.7', 2782, '££', true, 'Blacklock Covent Garden'],
  ['ChIJ-0sYC0UFdkgR22MCL9yb9sQ', 'Happy London', 'Restaurant', '4.4', 10317, '££', true, 'Happy London'],
  ['ChIJMyKwDswEdkgRlLsZAjZBRu4', 'Cinnamon Bazaar', 'Indian Restaurant', '4.6', 4498, '££', true, 'Donald Lo'],
  ['ChIJ7a_rDcwEdkgRdiGLXlk7s-g', 'Flat Iron Covent Garden', 'Steak House', '4.6', 11029, '££', true, 'Flat Iron Covent Garden'],
  ['ChIJyXplTswEdkgR3Duw3R08uas', 'Steak and Company – Covent Garden', 'Steak House', '4.5', 4221, '££', true, 'Siddharth Choudhary'],
  ['ChIJbUnC58oEdkgR4pwzPtYGrbY', 'Rules', 'British Restaurant', '4.6', 3739, '£££', true, 'Max Gruber'],
  ['ChIJZzLmQYoFdkgRf2kJmh4FwkA', 'Fatt Pundit', 'Asian Fusion Restaurant', '4.8', 18813, '££', true, 'Fatt Pundit'],
  ['ChIJFWhXXcwEdkgRkKBKheUNnC4', 'Clos Maggiore', 'Restaurant', '4.5', 3056, '££££', true, 'Clos Maggiore'],
  ['ChIJbX_Fhx8FdkgRbTfFDICmOhQ', 'Speedboat Bar', 'Thai Restaurant', '4.7', 6065, '££', true, 'Jack'],
  ['ChIJ37AHt9MEdkgRDVY9ZuyydVA', 'The Palomar', 'Middle Eastern Restaurant', '4.5', 2725, '££', true, 'The Palomar'],
  ['ChIJH4dEsM8EdkgRandd6RPxN5o', 'Old Shades', 'Pub', '4.7', 6262, '££', true, 'Old Shades'],
  ['ChIJcV5kM6gFdkgRCtE0zi7YSr4', "Larry's", 'Cocktail Bar', '4.7', 651, '££', true, "Larry's"],
  ['ChIJ5ZFEBAAFdkgR0y1WqqdRDro', 'The Spy Bar', 'Cocktail Bar', '4.5', 87, '£££', false, 'Jim Close'],
  ['ChIJyeyXtBsFdkgRRaWWegiX6Lo', 'Kioku Sake Bar', 'Bar', '5.0', 53, '£££', false, 'Kioku Sake Bar'],
  ['ChIJmXYlvFcFdkgRqhQ6z0F4BCY', 'Tequila Mockingbird Covent Garden', 'Bar', '4.5', 409, '££', false, 'Tequila Mockingbird Covent Garden'],
  ['ChIJKXTZKcwEdkgRZs8E0eH5zVI', 'The Harp, Covent Garden', 'Pub', '4.6', 3732, '££', true, 'The Harp, Covent Garden'],
  ['ChIJ8SlAHNIEdkgRJV2dTJ8VrKI', 'The Stage at The Londoner', 'Restaurant', '4.8', 252, '£££', true, 'The Stage at The Londoner'],
  ['ChIJjwnAQLUFdkgR34dn7CgORp4', '8 at The Londoner', 'Bar', '4.7', 392, '£££', false, '8 at The Londoner'],
  ['ChIJAXVmW3kFdkgRwAVljDgvR_Y', 'Simmons Bar – Leicester Square', 'Bar', '4.5', 2693, '££', false, 'Simmons Bar | Leicester Square'],
  ['ChIJo8HQzc0EdkgRz8yyHDjJ8C0', 'Blind Spot London', 'Cocktail Bar', '4.5', 662, '££', false, 'Blind Spot London'],
  ['ChIJ79cBDAoFdkgR00V_0BAzrlU', "Mr Fogg's Society of Exploration", 'Cocktail Bar', '4.5', 2588, '££', false, "Mr Fogg's Society of Exploration"],
];

function categoryForPremiumType(type: string): VenueCategory {
  const normalized = type.toLowerCase();
  if (normalized.includes('pub')) return 'Pub';
  if (normalized.includes('bar')) return 'Bar';
  if (normalized.includes('coffee') || normalized.includes('cafe')) return 'Coffee';
  return 'Restaurant';
}

const premiumRotationVenues: Venue[] = premiumRotationSeeds.map(
  ([id, name, type, rating, ratingCount, price, openNow, attribution], index) => {
    const distanceMeters = 850 + index * 135;
    return {
      id,
      name,
      neighborhood: 'Central London',
      category: categoryForPremiumType(type),
      type,
      distance: `${(distanceMeters / 1000).toFixed(1)} km`,
      walkingTime: `~${Math.max(5, Math.round(distanceMeters / 80))} min walk`,
      rating,
      ratingCount,
      price,
      distanceMeters,
      description: 'A standout London destination selected for the Banging rotation.',
      hours: openNow ? 'Open now' : 'Closed · Opens later',
      feature: type,
      fullAddress: `${name}, London, UK`,
      openNow,
      website: `https://www.google.com/search?q=${encodeURIComponent(`${name} London menu`)}`,
      mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} London`)}`,
      phone: '',
      premium: false,
      banging: true,
      promoted: false,
      photoAttributions: Array(3).fill(attribution),
    };
  },
);

type SuggestionSeed = {
  name: string;
  category: VenueCategory;
  type: string;
};

const suggestionSeeds: SuggestionSeed[] = [
  { name: 'Dishoom', category: 'Restaurant', type: 'Indian Restaurant' },
  { name: 'Flat Iron', category: 'Restaurant', type: 'Steak House' },
  { name: 'Pizza Pilgrims', category: 'Restaurant', type: 'Italian Restaurant' },
  { name: 'Franco Manca', category: 'Restaurant', type: 'Italian Restaurant' },
  { name: 'Honest Burgers', category: 'Restaurant', type: 'Burger Restaurant' },
  { name: "Rosa's Thai", category: 'Restaurant', type: 'Thai Restaurant' },
  { name: 'Bancone', category: 'Restaurant', type: 'Italian Restaurant' },
  { name: 'Padella', category: 'Restaurant', type: 'Italian Restaurant' },
  { name: 'Bao', category: 'Restaurant', type: 'Asian Restaurant' },
  { name: 'Mildreds', category: 'Restaurant', type: 'Vegetarian Restaurant' },
  { name: 'Hawksmoor', category: 'Restaurant', type: 'Steak House' },
  { name: 'The Ivy', category: 'Restaurant', type: 'British Restaurant' },
  { name: 'The Breakfast Club', category: 'Restaurant', type: 'Breakfast Restaurant' },
  { name: 'Wahaca', category: 'Restaurant', type: 'Mexican Restaurant' },
  { name: 'Ottolenghi', category: 'Restaurant', type: 'Mediterranean Restaurant' },
  { name: "Sticks'n'Sushi", category: 'Restaurant', type: 'Japanese Restaurant' },
  { name: 'The Barbary', category: 'Restaurant', type: 'Middle Eastern Restaurant' },
  { name: 'Hoppers', category: 'Restaurant', type: 'Sri Lankan Restaurant' },
  { name: 'Bob Bob Ricard', category: 'Restaurant', type: 'British Restaurant' },
  { name: 'Duck & Waffle', category: 'Restaurant', type: 'British Restaurant' },
];

const suggestionNeighborhoods = [
  'Battersea',
  'Chelsea',
  'Clapham',
  'Brixton',
  'Shoreditch',
  'Soho',
  'Covent Garden',
  'Camden',
  'Islington',
  'Greenwich',
] as const;

const expandedSuggestionVenues: Venue[] = Array.from({ length: 200 }, (_, index) => {
  const seed = suggestionSeeds[index % suggestionSeeds.length];
  const neighborhood = suggestionNeighborhoods[Math.floor(index / suggestionSeeds.length)];
  const distanceMeters = 1200 + index * 83;
  const openNow = index % 5 !== 0;
  const price = ['£', '££', '£££'][index % 3];
  const description =
    seed.category === 'Restaurant'
      ? `A popular ${seed.type.toLowerCase()} in ${neighborhood}.`
      : `A welcoming ${seed.type.toLowerCase()} in ${neighborhood}.`;

  return {
    id: `panda-suggestion-${index + 1}`,
    name: `${seed.name} ${neighborhood}`,
    neighborhood: `${neighborhood}, London`,
    category: seed.category,
    type: seed.type,
    distance: `${(distanceMeters / 1000).toFixed(1)} km`,
    walkingTime: `~${Math.max(8, Math.round(distanceMeters / 80))} min walk`,
    rating: (4.1 + ((index * 7) % 9) / 10).toFixed(1),
    ratingCount: 180 + ((index * 83) % 7600),
    price,
    distanceMeters,
    description,
    hours: openNow ? 'Open now' : 'Closed · Opens later today',
    feature: seed.type,
    fullAddress: `${neighborhood}, London, UK`,
    openNow,
    website: `https://www.google.com/search?q=${encodeURIComponent(`${seed.name} ${neighborhood} London menu`)}`,
    mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${seed.name} ${neighborhood} London`)}`,
    phone: '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: [],
  };
});

export const venues: Venue[] = [
  {
    id: 'ChIJcf8BYdsFdkgRGywbFlr0HPE',
    name: 'Shisha ع الرايق شيشه',
    neighborhood: 'Nine Elms, London',
    category: 'Bar',
    type: 'Hookah Bar',
    distance: '423 m',
    distanceMeters: 423,
    walkingTime: '~5 min walk',
    rating: '4.8',
    ratingCount: 41,
    price: '££',
    description: 'A relaxed hookah bar beside RiverLight Quay.',
    hours: 'Open now',
    feature: 'Hookah Bar',
    fullAddress: '1 RiverLight Quay, Nine Elms Ln, Nine Elms, London SW11 8AU, UK',
    openNow: true,
    website: '',
    mapsUri: 'https://maps.google.com/?cid=17374030130243644443',
    phone: '07455 632550',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: ['a.a.d bandar'],
  },
  {
    id: 'ChIJR52OV74FdkgRjCEgAh_1gu0',
    name: 'tashas Battersea',
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'Restaurant',
    distance: '444 m',
    distanceMeters: 444,
    walkingTime: '~6 min walk',
    rating: '4.4',
    ratingCount: 642,
    price: '££',
    description: 'All-day dining at Battersea Power Station.',
    hours: 'Open now',
    feature: 'Restaurant',
    fullAddress: 'Battersea Power Station, 3 Prospect Wy, Nine Elms, London SW11 8BH, UK',
    openNow: true,
    website: 'https://www.tashascafe.com/locations/london/battersea/',
    mapsUri: 'https://maps.google.com/?cid=17114511047489757580',
    phone: '020 3011 1989',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: ['tashas Battersea'],
  },
  {
    id: 'ChIJ1XmzwncFdkgRQEdtfxg60k8',
    name: 'Passyunk Avenue (Battersea)',
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'American Restaurant',
    distance: '464 m',
    distanceMeters: 464,
    walkingTime: '~6 min walk',
    rating: '4.4',
    ratingCount: 462,
    price: '££',
    description: 'Philadelphia-inspired food and drinks at Embassy Gardens.',
    hours: 'Open now',
    feature: 'American Restaurant',
    fullAddress: '7 New Union Square, Embassy, Gardens, Nine Elms, London SW11 7DN, UK',
    openNow: true,
    website: 'https://passyunkavenue.com/battersea/',
    mapsUri: 'https://maps.google.com/?cid=5751723550997038912',
    phone: '020 8194 8686',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: ['Passyunk Avenue (Battersea)'],
  },
  {
    id: 'ChIJGzea8_gFdkgRExlwW5PMpsg',
    name: 'Dishoom Battersea',
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'Indian Restaurant',
    distance: '479 m',
    distanceMeters: 479,
    walkingTime: '~6 min walk',
    rating: '4.9',
    ratingCount: 8239,
    price: '££',
    description: 'Bombay-inspired food and warm hospitality at Battersea.',
    hours: 'Open now',
    feature: 'Indian Restaurant',
    fullAddress: 'Upper Ground, 42 Electric Blvd, Nine Elms, London SW11 8BJ, UK',
    openNow: true,
    website: 'https://www.dishoom.com/battersea/',
    mapsUri: 'https://maps.google.com/?cid=14458468586985888019',
    phone: '020 7420 9327',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: ['Dishoom Battersea'],
  },
  {
    id: 'ChIJe0d53vwEdkgREBIjpHxxLxc',
    name: 'Nine Elms Tavern',
    neighborhood: 'Nine Elms, London',
    category: 'Pub',
    type: 'Pub',
    distance: '398 m',
    distanceMeters: 398,
    walkingTime: '~5 min walk',
    rating: '4.1',
    ratingCount: 901,
    price: '££',
    description: 'A neighbourhood pub by RiverLight Quay.',
    hours: 'Open now',
    feature: 'Pub',
    fullAddress: '1 RiverLight Quay, Nine Elms Ln, Nine Elms, London SW11 8AY, UK',
    openNow: true,
    website: 'https://www.nineelmstavern.co.uk/',
    mapsUri: 'https://maps.google.com/?cid=1670678766921388560',
    phone: '020 3053 8825',
    premium: false,
    banging: false,
    promoted: true,
    photoAttributions: ['Nine Elms Tavern'],
  },
  {
    id: 'ChIJYy_6qAQFdkgRpfV6fOqblek',
    name: 'Tonkotsu Battersea',
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'Restaurant',
    distance: '3.0 km',
    distanceMeters: 3047,
    walkingTime: '~39 min walk',
    rating: '4.6',
    ratingCount: 2954,
    price: '££',
    description:
      'Japanese ramen, gyoza, and cocktails beneath the railway arches at Battersea Power Station.',
    hours: 'Open now',
    feature: 'Japanese ramen',
    fullAddress: 'Battersea Power Station, 6 Arches Ln, Nine Elms, London SW11 8AB, UK',
    openNow: true,
    website: 'https://tonkotsu.co.uk/locations/battersea/',
    mapsUri: 'https://maps.google.com/?cid=16831530613780182437',
    phone: '020 7720 7695',
    premium: true,
    banging: true,
    promoted: false,
    photoAttributions: Array(5).fill('Tonkotsu Battersea'),
  },
  {
    id: 'ChIJR7FHQ7oFdkgRcGgNclUbmGs',
    name: 'JOIA Restaurant, Bar & Rooftop',
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'Restaurant',
    distance: '0.3 mi',
    distanceMeters: 560,
    walkingTime: '~7 min walk',
    rating: '4.4',
    ratingCount: 898,
    price: '',
    description:
      'Portuguese and Iberian cooking high above Battersea, with a rooftop bar and sweeping views across London.',
    hours: 'Closed · Opens later today',
    feature: 'Rooftop dining',
    fullAddress: '15th Floor, 1 Electric Blvd, Nine Elms, London SW11 8BJ, UK',
    openNow: false,
    website: 'https://www.joiabattersea.co.uk/',
    mapsUri: 'https://maps.google.com/?q=JOIA+Restaurant+Bar+Rooftop+London',
    phone: '020 3833 8333',
    premium: true,
    banging: true,
    promoted: false,
    photoAttributions: Array(5).fill('JOIA Restaurant, Bar & Rooftop'),
  },
  {
    id: 'ChIJ4XBm9cwFdkgRzwdLPoBi8oI',
    name: "Megan's Battersea Power Station",
    neighborhood: 'Nine Elms, London',
    category: 'Restaurant',
    type: 'Mediterranean Restaurant',
    distance: '0.4 mi',
    distanceMeters: 720,
    walkingTime: '~9 min walk',
    rating: '4.6',
    ratingCount: 7338,
    price: '££',
    description:
      'A welcoming neighbourhood restaurant serving Mediterranean-inspired food beside Battersea Power Station.',
    hours: 'Open now · Closes 11:00 pm',
    feature: 'Mediterranean all day dining',
    fullAddress: 'The Power Station, 27 Circus Rd W, Nine Elms, London SW11 8NN, UK',
    openNow: true,
    website: 'https://megans.co.uk/locations/battersea-power-station/',
    mapsUri: 'https://maps.google.com/?q=Megans+Battersea+Power+Station',
    phone: '020 3468 0215',
    premium: true,
    banging: true,
    promoted: false,
    photoAttributions: [
      'Chris Burgess',
      "Megan's Battersea Power Station",
      'Wasan A',
      'Katie Henderson',
      'India',
    ],
  },
  {
    id: 'ChIJd6eAqGMFdkgRVY9AOpAFhHI',
    name: "Brinkley's",
    neighborhood: 'Chelsea, London',
    category: 'Restaurant',
    type: 'Restaurant',
    distance: '2.1 mi',
    distanceMeters: 3400,
    walkingTime: '~41 min walk',
    rating: '4.3',
    ratingCount: 380,
    price: '££',
    description:
      'A long-standing Chelsea dining room with polished service, a smart neighbourhood atmosphere, and a lively evening crowd.',
    hours: 'Closed · Opens later today',
    feature: 'Chelsea classic',
    fullAddress: '47 Hollywood Rd, London SW10 9HX, UK',
    openNow: false,
    website: 'https://brinkleys.com/',
    mapsUri: 'https://maps.google.com/?q=Brinkleys+47+Hollywood+Road+London',
    phone: '020 7351 1683',
    premium: true,
    banging: true,
    promoted: false,
    photoAttributions: [
      "Brinkley's",
      "Brinkley's",
      "Brinkley's",
      'Indrė Užkuraitytė - Maisuradzė',
      "Brinkley's",
    ],
  },
  ...expandedSuggestionVenues,
  ...premiumRotationVenues,
];

export function getVenue(id: string) {
  return venues.find((venue) => venue.id === id);
}