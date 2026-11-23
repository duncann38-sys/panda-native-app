import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
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
import { ReserveButton } from '@/components/ReserveButton';
import { PANDA_DISCOVERY_API } from '@/constants/services';
import { getPandaTimeMode } from '@/constants/panda-time';
import { useLiveVenues } from '@/context/live-venues';
import { classifyGooglePlace, type DiscoveryCategory } from '@/data/venue-categories';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { restorePlannerSnapshot } from '@/utils/planner-snapshot';
import { createPlannerProfileLoader, hasVerifiedPlannerFacts, retainPlannerSelection, verifyPlannerCandidates, type PlannerSelection } from '@/utils/planner-candidates';

const loadPlannerProfile = createPlannerProfileLoader(PANDA_DISCOVERY_API);

export type PlannerMode = 'morning' | 'lunch' | 'night';

type PlannerStop = {
  icon: string;
  label: string;
  tags: DiscoveryCategory[];
  terms?: string[];
};

export type PlannerSearchResult = {
  id: string;
  name: string;
  address: string;
  fullAddress?: string;
  lat?: number;
  lng?: number;
  type: string;
  rating?: number;
  ratingCount?: number;
  price?: string;
  openNow?: boolean;
  detailsDeferred?: boolean;
  openingHours?: string[];
  phone?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  directionsLink?: string;
  photoAttribution?: string;
  photoNames?: Array<{ name: string; attribution: string }>;
  photoName?: string;
  photoCount?: number;
  distanceMeters?: number;
  primaryType?: string;
  types?: string[];
  categories?: DiscoveryCategory[];
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
      { icon: '☕', label: 'Coffee', tags: ['Coffee'], terms: ['coffee', 'cafe'] },
      { icon: '🍳', label: 'Breakfast', tags: ['Breakfast'], terms: ['breakfast', 'all day'] },
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
      { icon: '🥗', label: 'Lunch', tags: ['Lunch'] },
      { icon: '☕', label: 'Coffee', tags: ['Coffee'], terms: ['coffee', 'cafe'] },
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
      { icon: '🍽️', label: 'Dinner', tags: ['Dinner'] },
      { icon: '🍸', label: 'Drinks', tags: ['Drinks', 'Bar'] },
      { icon: '🌙', label: 'Late night', tags: ['Nightlife', 'Bar', 'Pubs'], terms: ['bar', 'pub', 'rooftop', 'cocktail'] },
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
  if (normalized.includes('bar') || normalized.includes('cocktail')) return 'Bar';
  return 'Restaurant';
}

export function venueFromSearchResult(
  result: PlannerSearchResult,
  location: string,
): Venue {
  const classification = classifyGooglePlace({
    primaryType: result.primaryType,
    types: result.types,
    type: result.type,
    name: result.name,
  });
  const discoveryCategories = [...new Set([
    ...classification.categories,
    ...(result.categories ?? []),
  ])];
  const category = discoveryCategories.includes('Coffee')
    ? 'Coffee'
    : discoveryCategories.includes('Pubs')
      ? 'Pub'
      : discoveryCategories.some((tag) => ['Bar', 'Drinks', 'Nightlife'].includes(tag))
        ? 'Bar'
        : plannerCategory(result.type);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayHours = result.openingHours?.[todayIndex]?.replace(/^[^:]+:\s*/, '');
  const mapsUri =
    result.directionsLink
    || result.mapsUri
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.name)}&query_place_id=${encodeURIComponent(result.id)}`;
  return {
    id: result.id,
    name: result.name,
    neighborhood: location,
    category,
    type: result.type,
    distance: 'Live route',
    walkingTime: 'Directions available',
    rating: result.rating?.toFixed(1) ?? '',
    ratingCount: result.ratingCount ?? 0,
    price: result.price ?? '',
    distanceMeters: result.distanceMeters ?? 0,
    description: `${result.type} in ${location}.`,
    hours: todayHours ?? 'Live hours unavailable',
    feature: result.type,
    fullAddress: result.fullAddress || result.address,
    latitude: result.lat,
    longitude: result.lng,
    openNow: result.openNow === true,
    website: result.website || result.menuLink || mapsUri,
    mapsUri,
    phone: result.phone ?? '',
    premium: false,
    banging: false,
    promoted: false,
    photoNames: result.photoNames,
    photoAttributions: result.photoAttribution ? [result.photoAttribution] : [],
    photoName: result.photoNames?.[0]?.name || result.photoName,
    photoCount: result.photoCount ?? result.photoNames?.length ?? 0,
    detailsDeferred: result.detailsDeferred === true,
    discoveryCategories,
  };
}

function plannerTags(venue: Venue) {
  if (venue.discoveryCategories?.length) return venue.discoveryCategories;
  if (venue.category === 'Coffee') return ['Coffee', 'Breakfast', 'Lunch'] as DiscoveryCategory[];
  if (venue.category === 'Pub') return ['Pubs', 'Bar', 'Drinks', 'Lunch', 'Dinner'] as DiscoveryCategory[];
  if (venue.category === 'Bar') return ['Bar', 'Drinks', 'Nightlife', 'Dinner'] as DiscoveryCategory[];
  return ['Lunch', 'Dinner'] as DiscoveryCategory[];
}

function priceLevel(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(4, Math.round(value)));
  const text = String(value ?? '').trim();
  const pounds = text.match(/£/g)?.length ?? 0;
  if (pounds) return Math.min(pounds, 4);
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(4, Math.round(numeric))) : 0;
}

function getPlan(
  mode: PlannerMode,
  price: string,
  location: string,
  offset: number,
  currentLocationVenues: Venue[],
): Array<Venue | null> {
  const used = new Set<string>();
  const locationQuery = plannerLocationQuery(location);
  const sourceVenues = locationQuery ? [] : currentLocationVenues.filter((venue) =>
    !venue.id.startsWith('osm:') && venue.source !== 'openstreetmap');
  const nearby = sourceVenues.filter((venue) => {
    const level = priceLevel(venue.price);
    const withinPrice = hasVerifiedPlannerFacts(venue) && level > 0 && level <= priceLevel(price);
    const withinArea =
      !locationQuery ||
      [venue.neighborhood, venue.fullAddress].join(' ').toLowerCase().includes(locationQuery);
    return withinPrice && withinArea;
  });
  if (locationQuery && !nearby.length) return [];

  const source = nearby;

  return PLAN_MODES[mode].stops.map((stop, stopIndex) => {
    const candidates = source
      .filter((venue) => {
        if (used.has(venue.id)) return false;
        const searchable = `${venue.category} ${venue.type} ${venue.feature}`.toLowerCase();
        const termMatch = stop.terms?.some((term) => searchable.includes(term));
        return Boolean(termMatch || stop.tags.some((tag) => plannerTags(venue).includes(tag)));
      })
      .sort((a, b) => venueScore(b) - venueScore(a) || a.distanceMeters - b.distanceMeters);
    const venue = candidates.length
      ? candidates[(offset + stopIndex) % candidates.length]
      : null;
    if (!venue) return null;
    used.add(venue.id);
    return venue;
  });
}

function walkBetween(first: Venue, second: Venue) {
  return first.id !== second.id ? 'View route for walking time' : '';
}

export function PandaPlannerSheet({
  initialLocation,
  initialMode,
  initialPlanIds,
  initialPlanVenues,
  initialPrice,
  onOpenMap,
  onOpenDirections,
  onOpenVenue,
  openRequest,
}: {
  initialLocation?: string;
  initialMode?: PlannerMode;
  initialPlanIds?: string;
  initialPlanVenues?: string;
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
  const { liveVenues, coordinates } = useLiveVenues();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PlannerMode>(initialMode ?? defaultMode);
  const [price, setPrice] = useState<(typeof PRICE_OPTIONS)[number]>(
    initialPrice === '££' || initialPrice === '£££' || initialPrice === '££££' ? initialPrice : '££',
  );
  const [location, setLocation] = useState(initialLocation || 'Current location');
  const [locationFocused, setLocationFocused] = useState(false);
  const [shuffle, setShuffle] = useState(0);
  const [remoteCandidates, setRemoteCandidates] = useState<Venue[] | null>(null);
  const [remoteLocation, setRemoteLocation] = useState('');
  const [remoteSearchState, setRemoteSearchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const stableSelection = useRef<PlannerSelection | null>(null);
  const pullHint = useRef(new Animated.Value(0)).current;
  const restoredPlan = useMemo(() => {
    const ids = String(initialPlanIds || '').split(',').filter(Boolean);
    if (
      ids.length !== PLAN_MODES[mode].stops.length || shuffle !== 0
      || (initialMode && mode !== initialMode)
      || (initialPrice && price !== initialPrice)
      || location !== (initialLocation || 'Current location')
    ) return null;
    const snapshot = restorePlannerSnapshot(initialPlanVenues, ids);
    const restored = ids.map((id) => snapshot?.find((venue) => venue.id === id) ?? liveVenues.find((venue) => venue.id === id));
    return restored.every((venue) => venue && hasVerifiedPlannerFacts(venue)) ? (restored as Venue[]) : null;
  }, [initialPlanIds, initialPlanVenues, initialMode, initialPrice, initialLocation, location, mode, price, shuffle, liveVenues]);
  const config = PLAN_MODES[mode];
  const locationQuery = plannerLocationQuery(location);
  const localPlan = useMemo(
    () => restoredPlan ?? getPlan(mode, price, locationQuery || location, shuffle, liveVenues),
    [liveVenues, location, locationQuery, mode, price, restoredPlan, shuffle],
  );
  const needsNearbyDetails = !locationQuery && !restoredPlan && (
    liveVenues.length === 0
    || localPlan.length !== config.stops.length
    || localPlan.some((venue) => !venue)
  );
  // Price, shuffle and day/night choices only reselect from the same returned
  // candidate set. They must not restart an identical area search.
  const remotePlan = useMemo(
    () => remoteCandidates
      ? getPlan(mode, price, 'Current location', shuffle, remoteCandidates)
      : null,
    [mode, price, remoteCandidates, shuffle],
  );
  const proposedSlots = remotePlan && remoteLocation === locationQuery
    ? remotePlan
    : needsNearbyDetails
      ? config.stops.map(() => null)
      : localPlan;
  const selectionKey = JSON.stringify([mode, price, locationQuery, shuffle, openRequest]);
  const selection = retainPlannerSelection(stableSelection.current, selectionKey, proposedSlots, config.stops.length);
  const planSlots = selection.venues;
  useEffect(() => {
    stableSelection.current = open ? selection : null;
  }, [open, selection]);
  const plan = planSlots.filter((venue): venue is Venue => Boolean(venue));
  const displayedLocation = locationQuery
    ? locationQuery.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Current location';
  const locationSuggestions = AREA_SUGGESTIONS.filter((area) =>
    !locationQuery || area.toLowerCase().includes(locationQuery),
  );

  useEffect(() => {
    if (!open || restoredPlan || (!locationQuery && !needsNearbyDetails)) {
      setRemoteSearchState('idle');
      if (!open) {
        setRemoteCandidates(null);
        setRemoteLocation('');
        setRemoteSearchState('idle');
      }
      return undefined;
    }
    if (needsNearbyDetails && !coordinates) {
      setRemoteSearchState('error');
      return undefined;
    }
    if (remoteCandidates && remoteLocation === locationQuery) return undefined;

    let active = true;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    setRemoteCandidates(null);
    setRemoteLocation(locationQuery);
    setRemoteSearchState('loading');
    const timer = setTimeout(() => {
      deadline = setTimeout(() => {
        controller.abort();
        if (active) setRemoteSearchState('error');
      }, 15_000);
      void fetch(
        `${PANDA_DISCOVERY_API}/api/panda-ai`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venuesOnly: true,
            discoveryMode: 'indexed-feed',
            category: 'All',
            // Planner needs a small nearby candidate set from the existing ID
            // index. The 200-card floor belongs to category feeds, not Planner.
            pageSize: 60,
            radiusMeters: 4_800,
            ...(locationQuery
              ? { area: locationQuery }
              : coordinates
                ? { location: { lat: coordinates.latitude, lng: coordinates.longitude } }
                : {}),
          }),
        },
      )
        .then(async (response) => {
          const payload = (await response.json()) as { venues?: PlannerSearchResult[]; error?: string };
          if (!response.ok) throw new Error(payload.error || 'Planner venue search failed');
          return payload;
        })
        .then(async (payload) => {
          if (!active) return;
          const candidates = payload.venues ?? [];
          const verified = await verifyPlannerCandidates(
            candidates.map((candidate) => venueFromSearchResult(candidate, locationQuery || 'Current location')),
            loadPlannerProfile,
            controller.signal,
          );
          if (!active || controller.signal.aborted) return;
          setRemoteCandidates(verified);
          setRemoteLocation(locationQuery);
          setRemoteSearchState('ready');
        })
        .catch(() => {
          if (!active) return;
          setRemoteCandidates(null);
          setRemoteLocation('');
          setRemoteSearchState('error');
        })
        .finally(() => clearTimeout(deadline));
    }, 650);

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [locationQuery, open, needsNearbyDetails, restoredPlan, coordinates?.latitude, coordinates?.longitude]);

  useEffect(() => {
    if (!openRequest) return;
    if (initialMode) setMode(initialMode);
    if (initialLocation) setLocation(initialLocation);
    if (initialPrice === '££' || initialPrice === '£££' || initialPrice === '££££') setPrice(initialPrice);
    if (initialPlanIds) setShuffle(0);
    setOpen(true);
  }, [initialLocation, initialMode, initialPlanIds, initialPrice, openRequest]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pullHint, { toValue: 7, duration: 520, useNativeDriver: true }),
        Animated.timing(pullHint, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pullHint]);

  return (
    <>
      <Animated.View style={[styles.pullHandleMotion, { transform: [{ translateX: pullHint }] }]}>
        <Pressable
          accessibilityLabel="Pull out Panda Planner"
          accessibilityHint="Opens Panda's day and night planner"
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.pullHandle, { backgroundColor: colors.goldDeep }, pressed && styles.pressed]}
        >
          <LinearGradient colors={[colors.honey, colors.goldDeep]} style={StyleSheet.absoluteFill} />
          <Feather name="chevrons-right" size={23} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

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
              {remoteSearchState === 'loading' ? ' · Finding saved nearby venues…' : ''}
              {remoteSearchState === 'ready' ? ' · From Panda’s stored ID index' : ''}
              {remoteSearchState === 'error' ? ' · Stored lookup unavailable' : ''}
            </Text>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.greeting, { backgroundColor: colors.card, borderLeftColor: colors.goldDeep }]}>
                <PandaLogo size={34} />
                <Text style={[styles.greetingText, { color: colors.foreground }]}>
                  {config.greetings[shuffle % config.greetings.length]}
                </Text>
              </View>

              {config.stops.map((stop, index) => {
                const venue = planSlots[index];
                const nextVenue = planSlots[index + 1];

                return (
                <View key={`${mode}-${stop.label}-${shuffle}`}>
                  <View style={styles.stopBadge}>
                    <Text style={[styles.stopBadgeText, { color: colors.green800 }]}>
                      {stop.icon} {stop.label}
                    </Text>
                  </View>
                  {venue ? (
                    <>
                      <Pressable
                        accessibilityLabel={`Open ${venue.name}`}
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
                            {venue.name}
                          </Text>
                          <Text numberOfLines={1} style={[styles.venueAddress, { color: colors.mutedForeground }]}>
                            {venue.fullAddress}
                          </Text>
                          <Text numberOfLines={1} style={[styles.venueMeta, { color: colors.green700 }]}>
                            {venue.detailsDeferred
                              ? 'Hours not verified'
                              : venue.source === 'openstreetmap'
                                ? 'Hours not listed'
                                : venue.openNow ? 'Open' : 'Closed'}
                            {venue.rating ? ` · ★${venue.rating}` : ''}
                            {venue.ratingCount ? ` (${venue.ratingCount})` : ''}
                            {venue.price ? ` · ${venue.price}` : ''}
                            {venue.type ? ` · ${venue.type}` : ''}
                          </Text>
                          <Text style={[styles.googleSource, { color: colors.mutedForeground }]}>
                            {venue.sourceAttribution || 'Google'}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={19} color={colors.goldDeep} />
                      </Pressable>
                      <ReserveButton
                        venue={venue}
                        activitySurface="planner"
                        compact
                        onBeforeNavigate={() => setOpen(false)}
                        style={{ alignSelf: 'flex-start', marginTop: 10 }}
                      />
                      <Pressable
                        accessibilityLabel={`Walking directions to ${venue.name}`}
                        accessibilityRole="button"
                        onPress={() => {
                          setOpen(false);
                          onOpenDirections(venue, { plan, mode, price, location });
                        }}
                        style={styles.walkingLink}
                      >
                        <Ionicons name="walk-outline" size={17} color={colors.goldDeep} />
                        <Text style={[styles.walkingLinkText, { color: colors.goldDeep }]}>Walking directions</Text>
                      </Pressable>
                    </>
                  ) : (
                    <View style={[styles.emptySlot, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Ionicons
                        name={remoteSearchState === 'loading' ? 'time-outline' : 'search-outline'}
                        size={20}
                        color={colors.green700}
                      />
                      <View style={styles.emptySlotCopy}>
                        <Text style={[styles.emptySlotTitle, { color: colors.foreground }]}>
                          {remoteSearchState === 'loading'
                            ? `Checking live ${stop.label.toLowerCase()} venues and prices…`
                            : remoteSearchState === 'error'
                              ? 'Live venue and price checks unavailable'
                              : `No verified ${stop.label.toLowerCase()} match within this budget`}
                        </Text>
                        <Text style={[styles.emptySlotBody, { color: colors.mutedForeground }]}>
                          Panda checks nearby Google venues, live prices and ratings. Unknown prices are not treated as affordable.
                        </Text>
                      </View>
                    </View>
                  )}
                  {venue && nextVenue ? (
                    <View style={styles.connector}>
                      <View style={[styles.connectorLine, { backgroundColor: colors.goldLine }]} />
                      <Text style={[styles.connectorText, { color: colors.foreground }]}>
                        ↓ {walkBetween(venue, nextVenue)} to the next stop
                      </Text>
                    </View>
                  ) : null}
                </View>
                );
              })}

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
  pullHandleMotion: {
    left: 0,
    position: 'absolute',
    top: '43%',
    zIndex: 32,
  },
  pullHandle: {
    alignItems: 'flex-end',
    borderBottomRightRadius: 18,
    borderTopRightRadius: 18,
    elevation: 10,
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingRight: 6,
    width: 38,
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
  filters: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 11 },
  locationField: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, flexDirection: 'row', height: 43, paddingLeft: 10 },
  locationInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 7, paddingVertical: 0 },
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
  emptySlot: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 76, padding: 13 },
  emptySlotCopy: { flex: 1 },
  emptySlotTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, lineHeight: 17 },
  emptySlotBody: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 15, marginTop: 4 },
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