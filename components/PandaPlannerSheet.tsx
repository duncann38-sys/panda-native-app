import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaLogo } from '@/components/PandaLogo';
import { VenuePhoto } from '@/components/VenuePhoto';
import { PANDA_RUNTIME_API } from '@/constants/services';
import { getPandaTimeMode } from '@/constants/panda-time';
import { venues, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { useLiveVenues } from '@/context/live-venues';
import { choosePlanStops, googleDirectionsUrl, knownPriceWithinBudget, isLateNightVenue } from '@/utils/venue-actions';

export type PlannerMode = 'morning' | 'lunch' | 'night';
const plannerRoutes = new Map<string, { durationMinutes: number; expires: number; mode?: 'walking' | 'transit' }>();
const plannerProfiles = new Map<string, { value: GooglePlannerProfile; expires: number }>();
const plannerSearches = new Map<string, { values: PlannerSearchResult[]; expires: number }>();

type PlannerStop = {
  icon: string;
  label: string;
  categories: Array<Venue['category']>;
  terms?: string[];
  lateNight?: boolean;
};

type GooglePlannerProfile = {
  id: string;
  name: string;
  address: string;
  primaryType: string;
  rating: number | null;
  ratingCount: number | null;
  price: string | null;
  openNow: boolean | null;
  todayHours: string | null;
  googleMapsUrl: string;
  source: 'google_places';
  latitude?: number | null;
  longitude?: number | null;
  website?: string | null;
  photoNames?: Array<{ name: string; attribution: string }>;
};

type PlannerSearchResult = {
  rating?: number;
  ratingCount?: number;
  id: string;
  name: string;
  address: string;
  category: string;
  price?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const PLAN_MODES: Record<PlannerMode, { emoji: string; title: string; stops: PlannerStop[]; greetings: string[] }> = {
  morning: {
    emoji: '🌅',
    title: 'Plan my morning',
    greetings: [
      'Coffee first, excellent choices next — Panda has mapped out a lovely little morning adventure.',
      'Rise and shine — your easy-going morning is ready to roll. 🐼',
    ],
    stops: [
      { icon: '☕', label: 'Coffee', categories: ['Coffee'], terms: ['coffee', 'cafe'] },
      { icon: '🍳', label: 'Breakfast', categories: ['Restaurant'], terms: ['breakfast', 'all day'] },
      { icon: '🥐', label: 'Brunch', categories: ['Restaurant', 'Coffee'], terms: ['brunch', 'mediterranean'] },
    ],
  },
  lunch: {
    emoji: '🍽️',
    title: 'Plan my lunch',
    greetings: [
      'Excellent choice — your lunch break just got promoted to main-character status. 🐼',
      'No sad desk lunch today — Panda has lined up something worth leaving the house for.',
    ],
    stops: [
      { icon: '🥗', label: 'Lunch', categories: ['Restaurant'] },
      { icon: '☕', label: 'Coffee', categories: ['Coffee'], terms: ['coffee', 'cafe'] },
      { icon: '🍰', label: 'Something sweet', categories: ['Coffee', 'Restaurant'], terms: ['dessert', 'bakery', 'cafe'] },
    ],
  },
  night: {
    emoji: '🌙',
    title: 'Plan my night',
    greetings: [
      'You have excellent taste — Panda has lined up a night worth leaving the sofa for. 🐼',
      'Consider the evening upgraded: good food, great drinks and absolutely no boring plans.',
    ],
    stops: [
      { icon: '🍽️', label: 'Dinner', categories: ['Restaurant'] },
      { icon: '🍸', label: 'Drinks', categories: ['Bar', 'Pub'] },
      { icon: '🪩', label: 'Late night', categories: ['Bar', 'Pub'], terms: ['nightclub', 'disco', 'late bar'], lateNight: true },
    ],
  },
};

const PRICE_OPTIONS = ['££', '£££', '££££'] as const;
const AREA_SUGGESTIONS = [
  'Chelsea',
  'Soho',
  'Covent Garden',
  'Battersea',
  'Shoreditch',
  'Camden',
  'Clapham',
  'Brixton',
  'Islington',
  'Greenwich',
] as const;
const REMOTE_SEARCH_TERMS: Record<PlannerMode, string> = {
  morning: 'coffee breakfast brunch',
  lunch: 'lunch restaurants cafes',
  night: 'restaurants cocktail bars nightclubs late-night bars',
};

function defaultMode(): PlannerMode {
  return getPandaTimeMode();
}

function venueScore(venue: Venue) {
  return Number(venue.rating || 0) * Math.log(venue.ratingCount + 10);
}

function plannerLocationQuery(location: string) {
  const normalized = location.trim().toLowerCase();
  if (!normalized || normalized === 'current location') return '';

  return normalized
    .replace(/\b(current location|plan|my|morning|lunch|night|breakfast|dinner|today|tonight)\b/g, ' ')
    .replace(/\b(in|near|around|at|within|for)\b/g, ' ')
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function plannerCategory(category: string): Venue['category'] {
  const normalized = category.toLowerCase();
  if (normalized.includes('coffee') || normalized.includes('cafe') || normalized.includes('bakery')) return 'Coffee';
  if (normalized.includes('pub')) return 'Pub';
  if (normalized.includes('bar') || normalized.includes('cocktail') || normalized.includes('club') || normalized.includes('disco')) return 'Bar';
  return 'Restaurant';
}

function venueFromSearchResult(
  result: PlannerSearchResult,
  location: string,
): Venue {
  const category = plannerCategory(result.category);
  return {
    id: result.id,
    name: result.name,
    neighborhood: location,
    category,
    type: result.category,
    distance: 'Live route',
    walkingTime: 'Directions available',
    rating: result.rating != null ? result.rating.toFixed(1) : '',
    ratingCount: result.ratingCount ?? 0,
    price: result.price || '',
    latitude: result.latitude ?? undefined,
    longitude: result.longitude ?? undefined,
    distanceMeters: 0,
    description: `${result.category} in ${location}.`,
    hours: 'Loading live details',
    feature: result.category,
    fullAddress: result.address,
    openNow: false,
    website: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.name)}&query_place_id=${encodeURIComponent(result.id)}`,
    mapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.name)}&query_place_id=${encodeURIComponent(result.id)}`,
    phone: '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: [],
  };
}

function buildRemotePlan(
  mode: PlannerMode,
  location: string,
  results: Array<{ id: string; name: string; address: string; category: string }>,
) {
  const available = results.map((result) => venueFromSearchResult(result, location));
  const used = new Set<string>();

  return PLAN_MODES[mode].stops.flatMap((stop) => {
    const match = available.find((venue) => {
      if (used.has(venue.id)) return false;
      const searchable = `${venue.category} ${venue.type} ${venue.feature} ${venue.name}`.toLowerCase();
      return Boolean(stop.terms?.some((term) => searchable.includes(term)) || stop.categories.includes(venue.category));
    }) ?? available.find((venue) => !used.has(venue.id));
    if (!match) return [];
    used.add(match.id);
    return [match];
  });
}

function getPlan(mode: PlannerMode, price: string, location: string, offset: number) {
  const used = new Set<string>();
  const locationQuery = plannerLocationQuery(location);
  const nearby = venues.filter((venue) => {
    const withinPrice = Math.max(1, venue.price.length || 2) <= price.length;
    const withinArea =
      !locationQuery ||
      [venue.neighborhood, venue.fullAddress].join(' ').toLowerCase().includes(locationQuery);
    return withinPrice && withinArea;
  });
  if (locationQuery && !nearby.length) return [];

  const source = locationQuery
    ? nearby
    : nearby.filter((venue) => venue.id.startsWith('ChI')).length >= 3
      ? nearby
      : venues.filter((venue) => venue.id.startsWith('ChI') && Math.max(1, venue.price.length || 2) <= price.length);

  return PLAN_MODES[mode].stops.map((stop, stopIndex) => {
    const candidates = source
      .filter((venue) => {
        if (used.has(venue.id)) return false;
        const searchable = `${venue.category} ${venue.type} ${venue.feature}`.toLowerCase();
        const termMatch = stop.terms?.some((term) => searchable.includes(term));
        return Boolean(termMatch || stop.categories.includes(venue.category));
      })
      .sort((a, b) => venueScore(b) - venueScore(a) || a.distanceMeters - b.distanceMeters);
    const fallback = source.filter((venue) => !used.has(venue.id)).sort((a, b) => venueScore(b) - venueScore(a));
    const pool = candidates.length ? candidates : fallback;
    const venue = pool[(offset + stopIndex) % Math.max(1, Math.min(pool.length, 8))]
      ?? source[(offset + stopIndex) % Math.max(1, source.length)]
      ?? venues[stopIndex];
    used.add(venue.id);
    return venue;
  });
}

function walkBetween(first: Venue, second: Venue, route?: { durationMinutes: number; mode?: 'walking' | 'transit' }) {
  return route ? `${route.durationMinutes} min ${route.mode === 'transit' ? 'transit' : 'walk'} · Google route` : 'Journey unavailable';
}

export function PandaPlannerSheet({
  initialLocation,
  initialMode,
  initialPlanIds,
  initialPrice,
  onOpenMap,
  onOpenDirections,
  onOpenVenue,
  openRequest,
}: {
  initialLocation?: string;
  initialMode?: PlannerMode;
  initialPlanIds?: string;
  initialPrice?: string;
  onOpenMap: (
    plan: Venue[],
    mode: PlannerMode,
    context: { price: string; location: string },
  ) => void;
  onOpenDirections: (
    venue: Venue,
    context: { plan: Venue[]; mode: PlannerMode; price: string; location: string },
  ) => void;
  onOpenVenue: (
    venue: Venue,
    context: { plan: Venue[]; mode: PlannerMode; price: string; location: string },
  ) => void;
  openRequest?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PlannerMode>(initialMode ?? defaultMode);
  const [price, setPrice] = useState<(typeof PRICE_OPTIONS)[number]>(
    initialPrice === '££' || initialPrice === '£££' || initialPrice === '££££' ? initialPrice : '££',
  );
  const [location, setLocation] = useState(initialLocation || 'Current location');
  const [locationFocused, setLocationFocused] = useState(false);
  const [shuffle, setShuffle] = useState(0);
  const [googleProfiles, setGoogleProfiles] = useState<Record<string, GooglePlannerProfile | null>>({});
  const [remotePlan, setRemotePlan] = useState<Venue[] | null>(null);
  const [remoteLocation, setRemoteLocation] = useState('');
  const [remoteSearchState, setRemoteSearchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const restoredPlan = useMemo(() => {
    const ids = String(initialPlanIds || '').split(',').filter(Boolean);
    if (ids.length !== 3) return null;
    const restored = ids.map((id) => venues.find((venue) => venue.id === id));
    return restored.every(Boolean) ? (restored as Venue[]) : null;
  }, [initialPlanIds]);
  const { liveVenues, coordinates } = useLiveVenues();
  const config = PLAN_MODES[mode];
  const locationQuery = plannerLocationQuery(location);
  const searchArea = locationQuery || (coordinates ? `${coordinates.latitude.toFixed(2)}, ${coordinates.longitude.toFixed(2)}` : '');
  const sourceVenues = useMemo(() => !locationQuery && remotePlan && remoteLocation === searchArea
    ? [...liveVenues, ...remotePlan.filter(venue => !liveVenues.some(existing => existing.id === venue.id))] : liveVenues,
    [liveVenues, remotePlan, remoteLocation, searchArea, locationQuery]);
  const localPlan = useMemo(
    () => choosePlanStops(config.stops, sourceVenues, price, shuffle),
    [config.stops, sourceVenues, price, shuffle],
  );
  const candidatePlan = remotePlan && remoteLocation === locationQuery
    ? choosePlanStops(config.stops, remotePlan, price, shuffle) : locationQuery ? [] : localPlan;
  const candidateKey = `${price}:${candidatePlan.map(venue => venue.id).join(',')}`;
  const [verified, setVerified] = useState<{ key: string; plan: Venue[]; legs: Record<string, { durationMinutes: number; mode?: 'walking' | 'transit' }> } | null>(null);
  const [planCheck, setPlanCheck] = useState<'loading' | 'ready' | 'error' | 'empty'>('empty');
  const plan = verified?.key === candidateKey ? verified.plan : [];
  const verifiedLegs = verified?.key === candidateKey ? verified.legs : {};

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    if (candidatePlan.length < config.stops.length) { setVerified(null); setPlanCheck('empty'); return; }
    setPlanCheck('loading');
    void (async () => {
      const profiles = await Promise.all(candidatePlan.map(async venue => {
        const cached = plannerProfiles.get(venue.id);
        if (cached && cached.expires > Date.now()) return cached.value;
        const response = await fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venue.id)}/profile`,
          { signal: controller.signal });
        if (!response.ok) throw new Error('Venue facts unavailable');
        const value = await response.json() as GooglePlannerProfile;
        plannerProfiles.set(venue.id, { value, expires: Date.now() + 3 * 60 * 60 * 1000 });
        return value;
      }));
      if (profiles.some(profile => !knownPriceWithinBudget(profile.price, price) ||
        !Number.isFinite(profile.latitude) || !Number.isFinite(profile.longitude))) {
        throw new Error('A venue has no verified price within the selected budget');
      }
      const verifiedVenues = candidatePlan.map((venue, index) => ({
        ...venue, name: profiles[index].name, fullAddress: profiles[index].address,
        price: profiles[index].price!, latitude: profiles[index].latitude!,
        longitude: profiles[index].longitude!, mapsUri: profiles[index].googleMapsUrl,
        website: profiles[index].website || venue.website, photoNames: profiles[index].photoNames,
      }));
      const legs: Record<string, { durationMinutes: number; mode?: 'walking' | 'transit' }> = {};
      const checks: Promise<void>[] = [];
      for (let first = 0; first < verifiedVenues.length; first++) {
        for (let second = first + 1; second < verifiedVenues.length; second++) {
          checks.push((async () => {
          const from = verifiedVenues[first], to = verifiedVenues[second];
          const isLateLeg = mode === 'night' && first === 1 && second === 2;
          const isLateJourney = mode === 'night' && second === 2;
          const key = `${from.id}:${to.id}:${isLateJourney ? 'transit' : 'walking'}`;
          let route = plannerRoutes.get(key);
          if (!route || route.expires <= Date.now()) {
            const response = await fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(to.id)}/${isLateJourney ? 'transit' : 'walking'}?latitude=${from.latitude}&longitude=${from.longitude}&planner=1&max_minutes=${isLateLeg ? 40 : 60}`,
              { signal: controller.signal });
            if (!response.ok) throw new Error('Walking journey unavailable');
            const payload = await response.json() as { durationMinutes: number; recommendation?: string; directWalk?: { durationMinutes: number }; transitRoute?: { durationMinutes: number } };
            const durationMinutes = isLateJourney
              ? payload.recommendation === 'walk' ? payload.directWalk?.durationMinutes : payload.transitRoute?.durationMinutes
              : payload.durationMinutes;
            if (!Number.isFinite(durationMinutes) || durationMinutes! < 1) throw new Error('Invalid verified journey');
            route = { durationMinutes: durationMinutes!, expires: Date.now() + 3 * 60 * 60 * 1000, mode: isLateJourney && payload.recommendation !== 'walk' ? 'transit' : 'walking' };
            plannerRoutes.set(key, route);
          }
          if (route.durationMinutes > (isLateLeg ? 40 : 60)) throw new Error('Venues exceed the travel limit');
          legs[`${from.id}:${to.id}`] = route;
          })());
        }
      }
      await Promise.all(checks);
      if (!active) return;
      setGoogleProfiles(current => ({ ...current, ...Object.fromEntries(profiles.map(profile => [profile.id, profile])) }));
      setVerified({ key: candidateKey, plan: verifiedVenues, legs });
      setPlanCheck('ready');
    })().catch(() => { if (active) { setVerified(null); setPlanCheck('error'); } });
    return () => { active = false; controller.abort(); };
  }, [candidateKey, open]);
  const displayedLocation = locationQuery
    ? locationQuery.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Current location';
  const locationSuggestions = AREA_SUGGESTIONS.filter((area) =>
    !locationQuery || area.toLowerCase().includes(locationQuery),
  );

  useEffect(() => {
    if (!open) return;
    const needsNightlife = mode === 'night' && !liveVenues.some(isLateNightVenue);
    if (!searchArea || (!locationQuery && !needsNightlife)) {
      setRemotePlan(null);
      setRemoteLocation('');
      setRemoteSearchState('idle');
      return undefined;
    }

    let active = true;
    const cacheKey = `${mode}:${searchArea}`;
    const cached = plannerSearches.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      setRemotePlan(cached.values.map(result => venueFromSearchResult(result, searchArea)));
      setRemoteLocation(searchArea);
      setRemoteSearchState('ready');
      return;
    }
    setRemoteSearchState('loading');
    const timer = setTimeout(() => {
      const namedArea = locationQuery && AREA_SUGGESTIONS.some(area => area.toLowerCase() === locationQuery)
        ? `${searchArea}, London` : searchArea;
      const terms = !locationQuery && needsNightlife ? ['nightclubs discos late-night bars']
        : mode === 'night' ? ['restaurants', 'bars', 'nightclubs'] : [REMOTE_SEARCH_TERMS[mode]];
      void Promise.all(terms.map(async term => {
        const response = await fetch(`${PANDA_RUNTIME_API}/api/partner/venues?query=${encodeURIComponent(`${term} in ${namedArea}`)}`,
          { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Planner venue search failed');
        return (await response.json()) as { results?: PlannerSearchResult[] };
      })).then(payloads => ({ results: [...new Map(payloads.flatMap(payload => payload.results ?? [])
        .map(result => [result.id, result])).values()] }))
        .then((payload) => {
          if (!active) return;
          plannerSearches.set(cacheKey, { values: payload.results ?? [], expires: Date.now() + 3 * 60 * 60 * 1000 });
          setRemotePlan((payload.results ?? []).map(result => venueFromSearchResult(result, searchArea)));
          setRemoteLocation(searchArea);
          setRemoteSearchState('ready');
        })
        .catch(() => {
          if (!active) return;
          setRemotePlan(null);
          setRemoteLocation('');
          setRemoteSearchState('error');
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [locationQuery, searchArea, mode, open, liveVenues]);

  useEffect(() => {
    let active = true;
    const missingIds = plan
      .map((venue) => venue.id)
      .filter((id) => id.startsWith('ChI') && !Object.prototype.hasOwnProperty.call(googleProfiles, id));
    if (!missingIds.length) return undefined;

    void Promise.all(
      missingIds.map(async (id) => {
        try {
          const cached = plannerProfiles.get(id);
          if (cached && cached.expires > Date.now()) return cached.value;
          const response = await fetch(
            `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(id)}/profile?plannerVersion=1`,
            { headers: { Accept: 'application/json' } },
          );
          if (!response.ok) return null;
          return (await response.json()) as GooglePlannerProfile;
        } catch {
          return null;
        }
      }),
    ).then((profiles) => {
      if (!active) return;
      setGoogleProfiles((current) => {
        const next = { ...current };
        missingIds.forEach((id, index) => {
          const profile = profiles[index];
          next[id] = profile?.source === 'google_places' ? profile : null;
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [googleProfiles, plan]);

  useEffect(() => {
    if (!openRequest) return;
    if (initialMode) setMode(initialMode);
    if (initialLocation) setLocation(initialLocation);
    if (initialPrice === '££' || initialPrice === '£££' || initialPrice === '££££') setPrice(initialPrice);
    setOpen(true);
  }, [initialLocation, initialMode, initialPrice, openRequest]);

  return (
    <>
      <Pressable
        accessibilityLabel="Open Plan my night"
        accessibilityHint="Opens Panda's day and night planner"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pullHandle, { backgroundColor: colors.goldDeep }, pressed && styles.pressed]}
      >
        <LinearGradient colors={[colors.honey, colors.goldDeep]} style={StyleSheet.absoluteFill} />
        <Feather name="chevron-right" size={22} color="#FFFFFF" />
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close planner"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={styles.scrim}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.goldLine,
                paddingBottom: Math.max(18, insets.bottom + 10),
              },
            ]}
          >
            <View style={[styles.grip, { backgroundColor: colors.goldLine }]} />
            <View style={styles.header}>
              <View style={styles.headingCopy}>
                <Text style={[styles.title, { color: colors.foreground }]}>{config.title}</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Tap a stop · re-roll with Panda Shuffle
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close planner"
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={[styles.closeButton, { backgroundColor: colors.secondary }]}
              >
                <Feather name="x" size={19} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={[styles.modeRow, { backgroundColor: colors.secondary }]}>
              {(Object.keys(PLAN_MODES) as PlannerMode[]).map((item, index, items) => (
                <Fragment key={item}>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: item === mode }}
                    onPress={() => {
                      setMode(item);
                      setShuffle(0);
                    }}
                    style={[
                      styles.modeButton,
                      item === mode && { backgroundColor: colors.honey },
                    ]}
                  >
                    <Text style={[styles.modeText, { color: item === mode ? colors.honeyInk : colors.foreground }]}>
                      {PLAN_MODES[item].emoji} {item[0].toUpperCase() + item.slice(1)}
                    </Text>
                  </Pressable>
                  {index < items.length - 1 ? (
                    <View style={[styles.modeDivider, { backgroundColor: colors.border }]} />
                  ) : null}
                </Fragment>
              ))}
            </View>

            <View style={styles.filters}>
              <View style={[styles.locationField, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="location-outline" size={17} color={colors.green700} />
                <TextInput
                  accessibilityLabel="Planner location"
                  onChangeText={setLocation}
                  onFocus={() => {
                    setLocationFocused(true);
                    if (location === 'Current location') setLocation('');
                  }}
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    setLocationFocused(false);
                  }}
                  placeholder="Current location or search area"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  style={[styles.locationInput, { color: colors.foreground }]}
                  value={location}
                />
                {location.trim() && location !== 'Current location' ? (
                  <Pressable
                    accessibilityLabel="Clear planner location"
                    accessibilityRole="button"
                    onPress={() => setLocation('')}
                    style={styles.clearLocationButton}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityLabel="Use current location"
                  accessibilityRole="button"
                  onPress={() => setLocation('Current location')}
                  style={styles.locateButton}
                >
                  <MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.green700} />
                </Pressable>
              </View>
              <View style={styles.priceRow}>
                {PRICE_OPTIONS.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityLabel={`Plan up to ${option}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: option === price }}
                    onPress={() => setPrice(option)}
                    style={[
                      styles.priceButton,
                      { borderColor: colors.border },
                      option === price && { backgroundColor: colors.honey, borderColor: colors.goldLine },
                    ]}
                  >
                    <Text style={[styles.priceText, { color: option === price ? colors.honeyInk : colors.foreground }]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {locationFocused && location.trim() && location !== 'Current location' ? (
              <View style={[styles.locationSuggestions, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.locationSuggestionsLabel, { color: colors.mutedForeground }]}>
                  SEARCH A CITY OR AREA
                </Text>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  style={styles.locationSuggestionRail}
                >
                  {locationSuggestions.length ? locationSuggestions.map((area) => (
                    <Pressable
                      key={area}
                      accessibilityLabel={`Use ${area} as planner location`}
                      accessibilityRole="button"
                      onPress={() => {
                        setLocation(area);
                        setLocationFocused(false);
                        Keyboard.dismiss();
                      }}
                      style={[styles.locationSuggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <Ionicons name="location-outline" size={13} color={colors.green700} />
                      <Text style={[styles.locationSuggestionText, { color: colors.foreground }]}>{area}</Text>
                    </Pressable>
                  )) : (
                    <Text style={[styles.noLocationSuggestion, { color: colors.mutedForeground }]}>
                      Type a city or area, then press search
                    </Text>
                  )}
                </ScrollView>
              </View>
            ) : null}

            <Text style={[styles.filterStatus, { color: colors.mutedForeground }]}>
              {displayedLocation} · Up to {price}
              {remoteSearchState === 'loading' ? ' · Finding live places…' : ''}
              {remoteSearchState === 'ready' ? ' · Live places' : ''}
              {remoteSearchState === 'error' ? ' · Live search unavailable' : ''}
            </Text>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.greeting, { backgroundColor: colors.card, borderLeftColor: colors.goldDeep }]}>
                <PandaLogo size={34} />
                <Text style={[styles.greetingText, { color: colors.foreground }]}>
                  {config.greetings[shuffle % config.greetings.length]}
                </Text>
              </View>

              <Text style={[styles.venueMeta, { color: colors.green700 }]}>
                {planCheck === 'loading' ? 'Verifying venue prices and walking journeys…' :
                  planCheck === 'error' ? 'No verified plan within your budget and one-hour travel limit. Try another area or budget.' :
                    planCheck === 'ready' ? 'Verified prices · every venue within a one-hour walk of every other venue' :
                      remoteSearchState === 'loading' ? 'Searching live venues…' : 'No complete plan matches this budget and area.'}
              </Text>
              {plan.length ? plan.map((venue, index) => {
                const google = googleProfiles[venue.id];
                const displayName = google?.name ?? venue.name;
                const displayAddress = google?.address ?? venue.fullAddress;

                return (
                <View key={`${mode}-${venue.id}-${shuffle}`}>
                  <View style={styles.stopBadge}>
                    <Text style={[styles.stopBadgeText, { color: colors.green800 }]}>
                      {config.stops[index].icon} {config.stops[index].label}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Open ${displayName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setOpen(false);
                      onOpenVenue(venue, { plan, mode, price, location });
                    }}
                    style={[styles.venueCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.photo}>
                      <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={88} />
                    </View>
                    <View style={styles.venueCopy}>
                      <Text numberOfLines={1} style={[styles.venueName, { color: colors.foreground }]}>
                        {displayName}
                      </Text>
                      <Text numberOfLines={1} style={[styles.venueAddress, { color: colors.mutedForeground }]}>
                        {displayAddress}
                      </Text>
                      {google ? (
                        <>
                          <Text numberOfLines={1} style={[styles.venueMeta, { color: colors.green700 }]}>
                            {google.openNow === true ? 'Open' : google.openNow === false ? 'Closed' : 'Hours unavailable'}
                            {google.rating !== null ? ` · ★${google.rating}` : ''}
                            {google.ratingCount !== null ? ` (${google.ratingCount})` : ''}
                            {google.price ? ` · ${google.price}` : ''}
                            {google.primaryType ? ` · ${google.primaryType}` : ''}
                          </Text>
                          <Text style={[styles.googleSource, { color: colors.mutedForeground }]}>Google</Text>
                        </>
                      ) : (
                        <Text style={[styles.venueMeta, { color: colors.mutedForeground }]}>
                          Loading Google details…
                        </Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={19} color={colors.goldDeep} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Walking directions to ${displayName}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setOpen(false);
                      void Linking.openURL(googleDirectionsUrl(venue, 'walking'));
                    }}
                    style={styles.walkingLink}
                  >
                    <Ionicons name="walk-outline" size={17} color={colors.goldDeep} />
                    <Text style={[styles.walkingLinkText, { color: colors.goldDeep }]}>Walking directions</Text>
                  </Pressable>
                  {index < plan.length - 1 ? (
                    <View style={styles.connector}>
                      <View style={[styles.connectorLine, { backgroundColor: colors.goldLine }]} />
                      <Text style={[styles.connectorText, { color: colors.foreground }]}>
                        ↓ {walkBetween(venue, plan[index + 1], verifiedLegs[`${venue.id}:${plan[index + 1].id}`])} to the next stop
                      </Text>
                    </View>
                  ) : null}
                </View>
                );
              }) : (
                <View style={[styles.emptyLocation, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={24} color={colors.green700} />
                  <Text style={[styles.emptyLocationTitle, { color: colors.foreground }]}>
                    {remoteSearchState === 'loading' ? 'Finding places in this location…' : `No Panda places found in “${locationQuery}”`}
                  </Text>
                  <Text style={[styles.emptyLocationBody, { color: colors.mutedForeground }]}>
                    Try a city or area such as Chelsea, Soho or Covent Garden.
                  </Text>
                </View>
              )}

            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                accessibilityLabel="Panda Shuffle"
                accessibilityRole="button"
                onPress={() => setShuffle((value) => value + 1)}
                style={[styles.shuffleButton, { backgroundColor: colors.honey }]}
              >
                <MaterialCommunityIcons name="shuffle-variant" size={19} color={colors.honeyInk} />
                <Text style={[styles.shuffleText, { color: colors.honeyInk }]}>Panda Shuffle</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="View planner route on map"
                accessibilityRole="button"
                disabled={!plan.length}
                onPress={() => {
                  setOpen(false);
                  onOpenMap(plan, mode, { price, location });
                }}
                style={[styles.mapButton, { backgroundColor: colors.green800 }, !plan.length && styles.disabledButton]}
              >
                <Ionicons name="map-outline" size={18} color={colors.primaryForeground} />
                <Text style={[styles.mapText, { color: colors.primaryForeground }]}>View route</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pullHandle: {
    alignItems: 'flex-end',
    borderBottomRightRadius: 18,
    borderTopRightRadius: 18,
    elevation: 10,
    height: 62,
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    paddingRight: 6,
    position: 'absolute',
    top: '43%',
    width: 38,
    zIndex: 32,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 26, 20, 0.48)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingTop: 9,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: -9 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
  },
  grip: { alignSelf: 'center', borderRadius: 999, height: 5, marginBottom: 11, width: 44 },
  header: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
  headingCopy: { flex: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  closeButton: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  modeRow: { borderRadius: 15, flexDirection: 'row', padding: 4 },
  modeButton: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 39 },
  modeDivider: { alignSelf: 'center', height: 22, width: StyleSheet.hairlineWidth },
  modeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  filters: { alignItems: 'stretch', flexDirection: 'column', gap: 8, marginTop: 11 },
  locationField: { alignItems: 'center', borderRadius: 13, borderWidth: 1, minWidth: 0, flexDirection: 'row', height: 43, paddingLeft: 10 },
  locationInput: { flex: 1, flexShrink: 1, minWidth: 0, fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 7, paddingVertical: 0 },
  clearLocationButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 25 },
  locateButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 34 },
  priceRow: { flexDirection: 'row', gap: 4 },
  priceButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 39, justifyContent: 'center', width: 32 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  filterStatus: { fontFamily: 'Inter_500Medium', fontSize: 10, marginBottom: 7, marginTop: 5 },
  locationSuggestions: { borderRadius: 13, borderWidth: 1, marginTop: 7, padding: 9 },
  locationSuggestionsLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.8, marginBottom: 7 },
  locationSuggestionRail: { flexGrow: 0 },
  locationSuggestion: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, marginRight: 6, paddingHorizontal: 10, paddingVertical: 7 },
  locationSuggestionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  noLocationSuggestion: { fontFamily: 'Inter_500Medium', fontSize: 10, paddingVertical: 6 },
  scrollContent: { paddingBottom: 12 },
  greeting: { alignItems: 'center', borderLeftWidth: 3, borderRadius: 15, flexDirection: 'row', gap: 10, marginBottom: 13, padding: 11 },
  greetingText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  emptyLocation: { alignItems: 'center', borderRadius: 16, borderWidth: 1, marginTop: 4, paddingHorizontal: 18, paddingVertical: 24 },
  emptyLocationTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 8, textAlign: 'center' },
  emptyLocationBody: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 6, textAlign: 'center' },
  stopBadge: { alignSelf: 'flex-start', marginBottom: 5, marginLeft: 5, paddingVertical: 2 },
  stopBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  venueCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 94,
    overflow: 'hidden',
    padding: 6,
  },
  photo: { borderRadius: 13, height: 82, overflow: 'hidden', width: 88 },
  venueCopy: { flex: 1, marginLeft: 10, minWidth: 0 },
  venueName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  venueAddress: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 4 },
  venueMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 7 },
  googleSource: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 3 },
  walkingLink: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 5, paddingHorizontal: 7, paddingVertical: 7 },
  walkingLinkText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  connector: { alignItems: 'center', flexDirection: 'row', marginBottom: 8, marginTop: -2, paddingHorizontal: 20 },
  connectorLine: { height: 1, marginRight: 8, width: 19 },
  connectorText: { fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  actions: { flexDirection: 'row', gap: 9, paddingTop: 9 },
  shuffleButton: { alignItems: 'center', borderRadius: 14, flex: 1.1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 },
  shuffleText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  mapButton: { alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 },
  mapText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});