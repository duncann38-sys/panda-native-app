import type { Venue } from '@/data/venues';

export type PartnerPlacement = {
  name: string;
  place_id: string;
  tier: 'banging' | 'discovery';
};

export function minimalPartnerVenue(placement: PartnerPlacement): Venue {
  const category: Venue['category'] = /\bpub\b/i.test(placement.name)
    ? 'Pub'
    : /\bbar\b/i.test(placement.name)
      ? 'Bar'
      : 'Restaurant';
  return {
    id: placement.place_id,
    name: placement.name,
    neighborhood: '',
    category,
    type: category,
    distance: '',
    walkingTime: '',
    rating: '',
    ratingCount: 0,
    price: '',
    distanceMeters: 0,
    description: '',
    hours: '',
    feature: '',
    fullAddress: '',
    openNow: false,
    cached: true,
    website: '',
    mapsUri: `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placement.place_id)}`,
    phone: '',
    premium: placement.tier === 'banging',
    banging: placement.tier === 'banging',
    promoted: true,
    photoNames: [],
    photoCount: 0,
    photoAttributions: [],
  };
}
