import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { fetch as expoFetch } from 'expo/fetch';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { discoveryDayPart, orderDiscoveryCategories } from '@/utils/discovery-category-order';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiscoveryRequestLane, discoveryDeadline } from '@/utils/discovery-request';
import { shouldFillDiscovery } from '@/utils/discovery-continuity';
import {
  AppState,
  Alert,
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BangingDrawer } from '@/components/BangingDrawer';
import { useVenueImpressions } from '@/hooks/useVenueImpressions';
import { useVenueResultAppearances } from '@/hooks/useVenueResultAppearances';
import { FilterDropdown } from '@/components/FilterDropdown';
import { PandaPlannerSheet, type PlannerMode, venueFromSearchResult } from '@/components/PandaPlannerSheet';
import { PandaWordmark } from '@/components/PandaWordmark';
import { SuggestionRow } from '@/components/SuggestionRow';
import { getPandaTimeEmoji, getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_DISCOVERY_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { useSavedVenues } from '@/context/saved-venues';
import { venues, type Venue } from '@/data/venues';
import { classifyGooglePlace, type DiscoveryCategory } from '@/data/venue-categories';
import { useColors } from '@/hooks/useColors';
import {
  estimatedWalkingMinutes,
} from '@/utils/discovery-walking-distance';
import {
  advanceLiveSearchCursor,
  hasMoreLiveSearch,
  liveDiscoverySearchQuery,
  liveSearchRequest,
  LIVE_DISCOVERY_EXPANSION_RINGS_KM,
  type LiveSearchCursor,
} from '@/utils/live-discovery-search';
import { recordVenueActivity, withVenueActivityContext } from '@/utils/record-venue-activity';
import { loadPartnerVenues } from '@/utils/partner-venues';
import { interleavePromotions, distanceBetween } from '@/utils/venue-actions';
import { bangingClock, isOrganicBangingVenue, rotateBanging } from '@/utils/banging-rotation';
import { getBangingAreaResults } from '@/utils/banging-area-search';

type TopCategory = 'All' | DiscoveryCategory;

const categories: Array<{
  label: TopCategory;
  emoji: string;
  terms: string[];
}> = [
  { label: 'All', emoji: '✨', terms: [] },
  { label: 'Indian', emoji: '🍛', terms: ['indian'] },
  { label: 'Italian', emoji: '🍝', terms: ['italian'] },
  { label: 'Chinese', emoji: '🥡', terms: ['chinese'] },
  { label: 'Spanish', emoji: '🥘', terms: ['spanish', 'iberian', 'tapas'] },
  { label: 'French', emoji: '🥐', terms: ['french'] },
  { label: 'British', emoji: '🫖', terms: ['british', 'english'] },
  { label: 'Japanese', emoji: '🍣', terms: ['japanese', 'sushi'] },
  { label: 'Mexican', emoji: '🌮', terms: ['mexican'] },
  { label: 'Turkish', emoji: '🍢', terms: ['turkish'] },
  { label: 'Pubs', emoji: '🍺', terms: ['pub', 'gastropub'] },
  { label: 'American', emoji: '🍔', terms: ['american', 'burger', 'diner'] },
  { label: 'Meat', emoji: '🥩', terms: ['meat', 'steak', 'steakhouse', 'grill', 'bbq', 'barbecue', 'roast', 'churrasco'] },
  { label: 'Bar', emoji: '🍹', terms: ['bar', 'cocktail', 'pub', 'wine', 'drinks', 'nightlife'] },
  { label: 'Lebanese', emoji: '🍕', terms: ['lebanese', 'middle eastern'] },
  { label: 'Thai', emoji: '🍜', terms: ['thai'] },
  { label: 'Chicken', emoji: '🍗', terms: ['chicken'] },
  { label: 'Pizza', emoji: '🍕', terms: ['pizza'] },
  { label: 'Burgers', emoji: '🍔', terms: ['burger'] },
  { label: 'Coffee', emoji: '☕', terms: ['coffee', 'cafe', 'café'] },
  { label: 'Breakfast', emoji: '🍳', terms: ['breakfast'] },
  { label: 'Lunch', emoji: '🥗', terms: ['lunch'] },
  { label: 'Bottomless', emoji: '🍾', terms: ['bottomless'] },
  { label: 'Dinner', emoji: '🍽️', terms: ['dinner', 'restaurant'] },
  { label: 'Drinks', emoji: '🍸', terms: ['drink', 'bar', 'cocktail', 'wine'] },
  { label: 'Sports', emoji: '⚽', terms: ['sport', 'football'] },
  { label: 'Live Music', emoji: '🎵', terms: ['music', 'dj', 'live'] },
  { label: 'Nightlife', emoji: '🌙', terms: ['nightlife', 'club', 'late night'] },
  { label: 'Shops', emoji: '🛍️', terms: [] },
  { label: 'Places of Interest', emoji: '🏛️', terms: [] },
];

const MAX_LOCAL_PARTNER_DISTANCE_METERS = Math.max(...LIVE_DISCOVERY_EXPANSION_RINGS_KM) * 1000;

type LiveVenueResult = {
  id: string;
  name: string;
  address: string;
  fullAddress?: string;
  type: string;
  primaryType?: string;
  rating?: number;
  ratingCount?: number;
  price?: string;
  openNow?: boolean;
  openingHours?: string[];
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  menuLink?: string;
  mapsUri?: string;
  directionsLink?: string;
  photoAttribution?: string;
  photoName?: string;
  photoCount?: number;
  primaryPhotoPath?: string;
  detailsDeferred?: boolean;
  distanceMeters?: number;
  types?: string[];
  hasMusic?: boolean;
  sourceQueries?: string[];
  categories?: DiscoveryCategory[];
  cachedAt?: number;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function finiteNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeLiveVenueResult(raw: unknown, query: string): LiveVenueResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = stringValue(record.id);
  const name = stringValue(record.name);
  const lat = finiteNumber(record.lat);
  const lng = finiteNumber(record.lng);
  if (!id || !name || lat === undefined || lng === undefined) return null;

  const rating = finiteNumber(record.rating);
  const ratingCount = finiteNumber(record.ratingCount);
  const photoCount = finiteNumber(record.photoCount);
  const openingHours = Array.isArray(record.openingHours)
    ? record.openingHours.map((value) => stringValue(value))
    : undefined;

  return {
    id,
    name,
    address: stringValue(record.address),
    fullAddress: stringValue(record.fullAddress) || undefined,
    type: stringValue(record.type) || 'Venue',
    primaryType: stringValue(record.primaryType) || undefined,
    rating,
    ratingCount,
    price: stringValue(record.price) || undefined,
    openNow: record.openNow === true,
    openingHours,
    lat,
    lng,
    phone: stringValue(record.phone) || undefined,
    website: stringValue(record.website) || undefined,
    menuLink: stringValue(record.menuLink) || undefined,
    mapsUri: stringValue(record.mapsUri) || undefined,
    directionsLink: stringValue(record.directionsLink) || undefined,
    photoAttribution: stringValue(record.photoAttribution) || undefined,
    photoName: stringValue(record.photoName) || undefined,
    photoCount,
    primaryPhotoPath: stringValue(record.primaryPhotoPath) || undefined,
    detailsDeferred: record.detailsDeferred === true,
    distanceMeters: finiteNumber(record.distanceMeters),
    types: stringArray(record.types),
    hasMusic: record.hasMusic === true,
    sourceQueries: [...new Set([...stringArray(record.sourceQueries), query])],
    categories: stringArray(record.categories) as DiscoveryCategory[],
    cachedAt: finiteNumber(record.cachedAt),
  };
}

type LiveDiscoveryState = 'loading' | 'ready' | 'permission-denied' | 'error';
type LiveDiscoveryFailureCode =
  | 'LOCATION-DENIED'
  | 'LOCATION-UNAVAILABLE'
  | 'CLIENT-RATE-LIMIT'
  | 'API-RATE-LIMIT'
  | 'API-FORBIDDEN'
  | 'API-NETWORK'
  | 'API-TIMEOUT'
  | 'API-RESPONSE'
  | 'API-QUOTA'
  | 'API-EMPTY'
  | 'FILTER-EMPTY';
type DiscoveryPageFailure = {
  code: Exclude<
    LiveDiscoveryFailureCode,
    'LOCATION-DENIED' | 'LOCATION-UNAVAILABLE' | 'API-EMPTY' | 'FILTER-EMPTY'
  >;
  status?: number;
};
type DiscoveryPage = {
  venues: LiveVenueResult[];
  nextPageToken?: string;
  failure?: DiscoveryPageFailure;
};
const DISCOVERY_REQUEST_WINDOW_MS = 60_000;
const DISCOVERY_REQUESTS_PER_WINDOW = 10;
const CACHE_REUSE_DISTANCE_METERS = 2_000;
const DISCOVERY_CACHE_TTL_MS = 30 * 60 * 1000;
const NEARBY_CACHE_KEY = 'panda-live-nearby-v1';
type NearbyCacheEntry = {
  savedAt: number;
  area: string;
  origin: { latitude: number; longitude: number };
  venues: Venue[];
};

async function readNearbyCache(): Promise<NearbyCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(NEARBY_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as NearbyCacheEntry;
    if (!Array.isArray(value.venues) || !value.venues.length || !value.area
      || !Number.isFinite(value.origin?.latitude) || !Number.isFinite(value.origin?.longitude)
      || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > DISCOVERY_CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

async function writeNearbyCache(value: NearbyCacheEntry) {
  try {
    await AsyncStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify(value));
  } catch {
    // An unavailable device cache must never prevent live results.
  }
}
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
  transport: 'expo' | 'system' = 'expo',
) {
  const deadline = discoveryDeadline(init.signal ?? undefined, timeoutMs);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  try {
    if (transport === 'system') {
      return await fetch(url, { ...init, headers, signal: deadline.signal });
    }
    return await expoFetch(url, {
      method: init.method,
      headers,
      body: init.body ?? undefined,
      signal: deadline.signal,
    });
  } finally {
    deadline.dispose();
  }
}

async function fetchLiveSearchPage(
  category: TopCategory,
  location: { lat: number; lng: number },
  cursor: LiveSearchCursor | undefined,
  reserveRequest: () => boolean,
  signal?: AbortSignal,
): Promise<DiscoveryPage> {
  if (signal?.aborted) return { venues: [] };
  if (!reserveRequest()) return { venues: [], failure: { code: 'CLIENT-RATE-LIMIT' } };
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      `${PANDA_DISCOVERY_API}/api/panda-ai`,
      25_000,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venuesOnly: true,
          query: liveDiscoverySearchQuery(category),
          location,
          ...liveSearchRequest(cursor),
        }),
      },
      'system',
    );
    if (!response.ok) {
      return {
        venues: [],
        failure: {
          code: response.status === 503 ? 'API-QUOTA'
            : response.status === 429 ? 'API-RATE-LIMIT'
            : response.status === 401 || response.status === 403 ? 'API-FORBIDDEN'
            : 'API-RESPONSE',
          status: response.status,
        },
      };
    }

    const payload = await response.json() as {
      venues?: unknown;
      nextPageToken?: unknown;
    };
    if (!Array.isArray(payload.venues)) {
      return { venues: [], failure: { code: 'API-RESPONSE', status: response.status } };
    }
    return {
      venues: payload.venues.flatMap((venue) => {
        const normalized = normalizeLiveVenueResult(venue, liveDiscoverySearchQuery(category));
        return normalized ? [normalized] : [];
      }),
      nextPageToken: typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined,
    };
  } catch (error) {
    return {
      venues: [],
      failure: {
        code: error instanceof Error && error.name === 'AbortError' ? 'API-TIMEOUT' : 'API-NETWORK',
      },
    };
  } finally {
    console.info('[Panda discovery]', JSON.stringify({
      stage: cursor ? 'next-page' : 'first-page',
      elapsedMs: Date.now() - startedAt,
      cancelled: signal?.aborted === true,
    }));
  }
}

function distanceInMeters(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(origin.latitude))
      * Math.cos(toRadians(destination.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function poundPrice(value: unknown): '' | '£' | '££' | '£££' | '££££' {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const level = Math.max(0, Math.min(4, Math.round(value)));
    return level ? '£'.repeat(level) as '£' | '££' | '£££' | '££££' : '';
  }
  const text = String(value ?? '').trim();
  const signs = text.match(/£/g)?.length ?? 0;
  if (signs > 0) return '£'.repeat(Math.min(signs, 4)) as '£' | '££' | '£££' | '££££';
  const numeric = Number(text);
  return Number.isFinite(numeric) ? poundPrice(numeric) : '';
}

function liveVenueFromResult(
  result: LiveVenueResult,
  origin: { latitude: number; longitude: number },
  area: string,
): Venue {
  const distanceMeters = distanceInMeters(origin, {
    latitude: result.lat,
    longitude: result.lng,
  });
  const distance =
    distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.max(distanceMeters, 1)} m`;
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayHoursValue = result.openingHours?.[todayIndex];
  const todayHours = typeof todayHoursValue === 'string'
    ? todayHoursValue.replace(/^[^:]+:\s*/, '')
    : undefined;
  const mapsUri = result.directionsLink
    || result.mapsUri
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.name)}&query_place_id=${encodeURIComponent(result.id)}`;
  const classification = classifyGooglePlace({
    name: result.name,
    type: result.type,
    primaryType: result.primaryType,
    types: result.types,
    sourceQueries: result.sourceQueries,
    hasMusic: result.hasMusic,
  });

  return {
    id: result.id,
    name: result.name,
    neighborhood: area,
    category: classification.primary,
    type: result.type,
    distance,
    walkingTime: distanceMeters ? `≈ ${estimatedWalkingMinutes(distanceMeters)} min walk` : 'Directions available',
    rating: Number.isFinite(result.rating) ? result.rating!.toFixed(1) : '',
    ratingCount: Number.isFinite(result.ratingCount) ? result.ratingCount! : 0,
    price: poundPrice(result.price),
    distanceMeters,
    description: `${result.type} near ${area}.`,
    hours: result.cachedAt ? 'Saved place · hours may have changed' : todayHours ?? 'Live hours unavailable',
    feature: result.type,
    fullAddress: result.fullAddress || result.address,
    latitude: result.lat,
    longitude: result.lng,
    sourceAttribution: ['Google Maps', result.photoAttribution].filter(Boolean).join(' · '),
    openNow: result.openNow === true,
    cached: Boolean(result.cachedAt),
    website: result.website || result.menuLink || mapsUri,
    mapsUri,
    phone: result.phone ?? '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: result.photoAttribution ? [result.photoAttribution] : [],
    photoName: result.photoName,
    photoCount: Number.isFinite(result.photoCount) ? result.photoCount! : 0,
    detailsDeferred: result.detailsDeferred,
    discoveryCategories: [...new Set([
      ...classification.categories,
      ...stringArray(result.categories) as DiscoveryCategory[],
    ])],
  };
}

function eligibleSearchPageVenues(
  results: LiveVenueResult[],
  origin: { latitude: number; longitude: number },
  area: string,
  category: TopCategory,
): Venue[] {
  return results.flatMap((result) => {
    if (
      !result.id
      || result.id.startsWith('osm:')
      || !result.name
      || !result.photoName
      || Math.max(result.photoCount ?? 0, result.photoName ? 1 : 0) < 1
      || !Number.isFinite(result.lat)
      || !Number.isFinite(result.lng)
    ) {
      return [];
    }
    const venue = liveVenueFromResult(result, origin, area);
    const categoryMatches = category === 'All'
      ? venue.category !== 'Shop' && venue.category !== 'Place of Interest'
      : venue.discoveryCategories?.includes(category) === true;
    return categoryMatches ? [venue] : [];
  }).sort((first, second) => first.distanceMeters - second.distanceMeters);
}

function mergeIndexedVenuePages(existing: Venue[], incoming: Venue[]): Venue[] {
  const venuesById = new Map(existing.map((venue) => [venue.id, venue]));
  incoming.forEach((venue) => {
    const current = venuesById.get(venue.id);
    venuesById.set(venue.id, current
      ? {
          ...current,
          ...venue,
          premium: current.premium || venue.premium,
          banging: current.banging || venue.banging,
          promoted: current.promoted || venue.promoted,
          photoAttributions: venue.photoAttributions.length
            ? venue.photoAttributions
            : current.photoAttributions,
          discoveryCategories: [...new Set([
            ...(current.discoveryCategories ?? []),
            ...(venue.discoveryCategories ?? []),
          ])],
        }
      : venue);
  });
  return [...venuesById.values()];
}

export default function DiscoverScreen() {
  const [categoryDayPart, setCategoryDayPart] = useState(discoveryDayPart);
  useFocusEffect(useCallback(() => {
    setCategoryDayPart(discoveryDayPart());
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') setCategoryDayPart(discoveryDayPart());
    });
    return () => listener.remove();
  }, []));
  const [bangingIsOpen, setBangingIsOpen] = useState(false);
  const discoveryImpressions = useVenueImpressions('discovery', !bangingIsOpen);
  const discoveryViewabilityPairs = useRef([discoveryImpressions.presentationPair, discoveryImpressions]).current;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openPlanner, plannerRequest, plannerIds, plannerVenues, plannerLocation, plannerPrice } = useLocalSearchParams<{
    openPlanner?: string;
    plannerRequest?: string;
    plannerIds?: string;
    plannerVenues?: string;
    plannerLocation?: string;
    plannerPrice?: string;
  }>();
  const plannerMode =
    openPlanner === 'morning' || openPlanner === 'lunch' || openPlanner === 'night' ? openPlanner : undefined;
  const currentTimeMode = getPandaTimeMode();
  const { isSaved, toggleSaved } = useSavedVenues();
  const {
    coordinates,
    liveArea,
    liveVenues,
    locationStatus,
    refreshLocation,
    setLiveArea,
    setLiveVenues,
  } = useLiveVenues();
  const [category, setCategory] = useState<TopCategory>('All');
  const [priceFilter, setPriceFilter] = useState<'Any price' | '£' | '££' | '£££' | '££££'>('Any price');
  const [sortBy, setSortBy] = useState<'Nearest' | 'Top rated'>('Nearest');
  const [openFilter, setOpenFilter] = useState<'price' | 'sort' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [liveDiscoveryState, setLiveDiscoveryState] = useState<LiveDiscoveryState>('loading');
  const [partners, setPartners] = useState<{ tiers: Record<string, string>; venues: Venue[] }>({ tiers: {}, venues: [] });
  const [bangingSupplement, setBangingSupplement] = useState<Venue[]>([]);
  const [bangingStatus, setBangingStatus] = useState('Finding luxury venues…');
  const [bangingRefreshTick, setBangingRefreshTick] = useState(0);
  const bangingOrigin = useRef('');
  const [bangingPremiumJourneys, setBangingPremiumJourneys] = useState<Record<string, {
    bangingTransitMinutes: number; bangingVerifiedAt: number;
  }>>({});
  const [rotationWindow, setRotationWindow] = useState(() => {
    const clock = bangingClock();
    return `${clock.day}:${clock.slot}`;
  });
  const [liveDiscoveryFailure, setLiveDiscoveryFailure] = useState<LiveDiscoveryFailureCode | null>(null);
  const [cachedNearbyAt, setCachedNearbyAt] = useState<number | null>(null);
  const [categoryLoading, setCategoryLoading] = useState<DiscoveryCategory | null>(null);
  const [feedPageFailure, setFeedPageFailure] = useState<LiveDiscoveryFailureCode | null>(null);
  const [feedPageLoading, setFeedPageLoading] = useState<TopCategory | null>(null);
  const loadedCategories = useRef(new Set<TopCategory>());
  const feedCursors = useRef(new Map<TopCategory, LiveSearchCursor>());
  const feedExhausted = useRef(new Set<TopCategory>());
  const feedVenueIds = useRef(new Map<TopCategory, Set<string>>());
  const liveLoadInFlight = useRef(false);
  const freshResultsLoaded = useRef(false);
  const displayedOrigin = useRef<{ latitude: number; longitude: number } | null>(null);
  const categoryLoadInFlight = useRef(false);
  const foregroundDiscovery = useRef(new DiscoveryRequestLane());
  const initialDiscovery = useRef(new DiscoveryRequestLane());
  const automaticPages = useRef(new Map<TopCategory, number>());
  const discoveryGeneration = useRef(0);
  const liveVenuesRef = useRef(liveVenues);
  liveVenuesRef.current = liveVenues;
  const discoveryRequestTimes = useRef<number[]>([]);
  const reserveDiscoveryRequest = useCallback(() => {
    const now = Date.now();
    discoveryRequestTimes.current = discoveryRequestTimes.current
      .filter((timestamp) => now - timestamp < DISCOVERY_REQUEST_WINDOW_MS);
    if (discoveryRequestTimes.current.length >= DISCOVERY_REQUESTS_PER_WINDOW) return false;
    discoveryRequestTimes.current.push(now);
    return true;
  }, []);
  useEffect(() => {
    if (locationStatus === 'permission-denied' || locationStatus === 'unavailable') return;
    let mounted = true;
    void (async () => {
      const cached = await readNearbyCache();
      if (!cached || !mounted || freshResultsLoaded.current) return;
      let reference = coordinates;
      if (!reference && Platform.OS !== 'web') {
        try {
          const permission = await Location.getForegroundPermissionsAsync();
          if (!permission.granted) return;
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
          if (lastKnown) {
            reference = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
          }
        } catch {
          return;
        }
      }
      if (!reference || distanceInMeters(cached.origin, reference) > CACHE_REUSE_DISTANCE_METERS
        || !mounted || freshResultsLoaded.current) return;
      const cachedVenues = cached.venues
        .filter((venue) => venue.source !== 'openstreetmap' && !venue.id.startsWith('osm:'));
      if (!cachedVenues.length) return;
      feedVenueIds.current.set('All', new Set(cachedVenues.map((venue) => venue.id)));
      displayedOrigin.current = cached.origin;
      setLiveArea(cached.area);
      setLiveVenues(cachedVenues.map((venue) => ({ ...venue, cached: true })));
      setCachedNearbyAt(cached.savedAt);
    })();
    return () => { mounted = false; };
  }, [coordinates?.latitude, coordinates?.longitude, locationStatus, setLiveArea, setLiveVenues]);
  const loadLiveVenues = useCallback(async (requestPermission: boolean) => {
    if (liveLoadInFlight.current) return;
    liveLoadInFlight.current = true;
    const requestController = initialDiscovery.current.begin();
    let located = false;
    const generation = discoveryGeneration.current + 1;
    discoveryGeneration.current = generation;
    setLiveDiscoveryState('loading');
    setLiveDiscoveryFailure(null);
    loadedCategories.current.clear();
    automaticPages.current.clear();
    feedCursors.current.clear();
    feedExhausted.current.clear();
    const previousAllPageIds = feedVenueIds.current.get('All');
    feedVenueIds.current.clear();
    if (previousAllPageIds) feedVenueIds.current.set('All', previousAllPageIds);
    try {
      const location = requestPermission || !coordinates
        ? await refreshLocation(requestPermission)
        : { status: 'ready' as const, coordinates };
      if (location.status !== 'ready') {
        const denied = location.status === 'permission-denied';
        setLiveDiscoveryFailure(denied ? 'LOCATION-DENIED' : 'LOCATION-UNAVAILABLE');
        setLiveDiscoveryState(denied ? 'permission-denied' : 'error');
        return;
      }

      located = true;
      if (!initialDiscovery.current.isCurrent(requestController)) return;
      const origin = {
        latitude: location.coordinates.latitude,
        longitude: location.coordinates.longitude,
      };
      let baseVenues = liveVenuesRef.current;
      if (displayedOrigin.current
        && distanceInMeters(displayedOrigin.current, origin) > CACHE_REUSE_DISTANCE_METERS) {
        setLiveVenues([]);
        baseVenues = [];
        setCachedNearbyAt(null);
        setLiveArea('');
        displayedOrigin.current = null;
        feedVenueIds.current.clear();
      }
      let area = 'your location';
      let published = false;
      // The area label is optional. Never hold live venues behind geocoding.
      void (async () => { try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: location.coordinates.latitude,
          longitude: location.coordinates.longitude,
        });
        const address = addresses[0];
        const broadArea = address?.district || address?.subregion || address?.city || address?.region;
        const postcodeArea = address?.postalCode?.split(/\s+/)[0];
        area =
          broadArea && !/^(greater london|london)$/i.test(broadArea)
            ? broadArea
            : postcodeArea || broadArea || area;
        if (published && discoveryGeneration.current === generation) setLiveArea(area);
      } catch {
        // A device geocoder failure must not block coordinate-based venue discovery.
      } })();

      const locationPayload = {
        lat: location.coordinates.latitude,
        lng: location.coordinates.longitude,
      };
      setFeedPageFailure(null);
      const firstSearchPage = await fetchLiveSearchPage(
        'All',
        locationPayload,
        undefined,
        reserveDiscoveryRequest,
        requestController.signal,
      );
      if (discoveryGeneration.current !== generation || !initialDiscovery.current.isCurrent(requestController)) return;
      if (firstSearchPage.failure) {
        setLiveDiscoveryFailure(firstSearchPage.failure.code);
        setLiveDiscoveryState('error');
        return;
      }

      let firstPageVenues = eligibleSearchPageVenues(
        firstSearchPage.venues,
        origin,
        area,
        'All',
      );
      let cursor = advanceLiveSearchCursor({ ringIndex: 0 }, firstSearchPage.nextPageToken);
      let fallbackFailure: DiscoveryPageFailure | undefined;
      while (!firstPageVenues.length && hasMoreLiveSearch(cursor)) {
        const request = liveSearchRequest(cursor);
        const usedExpansionRing = request.expansionRingKm !== undefined;
        const nextPage = await fetchLiveSearchPage('All', locationPayload, cursor, reserveDiscoveryRequest, requestController.signal);
        if (discoveryGeneration.current !== generation || !initialDiscovery.current.isCurrent(requestController)) return;
        if (nextPage.failure) {
          fallbackFailure = nextPage.failure;
          break;
        }
        firstPageVenues = mergeIndexedVenuePages(
          firstPageVenues,
          eligibleSearchPageVenues(nextPage.venues, origin, area, 'All'),
        );
        cursor = advanceLiveSearchCursor(cursor!, nextPage.nextPageToken, usedExpansionRing);
      }
      if (fallbackFailure && !firstPageVenues.length) {
        setLiveDiscoveryFailure(fallbackFailure.code);
        setLiveDiscoveryState('error');
        return;
      }
      if (hasMoreLiveSearch(cursor)) feedCursors.current.set('All', cursor!);
      else feedExhausted.current.add('All');
      loadedCategories.current.add('All');
      setLiveArea(area);
      const mergedFirstPage = mergeIndexedVenuePages(baseVenues, firstPageVenues);
      feedVenueIds.current.set('All', new Set(mergedFirstPage.map((venue) => venue.id)));
      setLiveVenues(mergedFirstPage);
      displayedOrigin.current = origin;
      freshResultsLoaded.current = true;
      setCachedNearbyAt(null);
      setLiveDiscoveryState('ready');
      published = true;
      if (fallbackFailure) setFeedPageFailure(fallbackFailure.code);
      void writeNearbyCache({
        savedAt: Date.now(),
        area,
        origin,
        venues: mergedFirstPage,
      });
      return;
    } catch {
      if (initialDiscovery.current.isCurrent(requestController)) {
        setLiveDiscoveryFailure('API-RESPONSE');
        setLiveDiscoveryState('error');
      }
    } finally {
      initialDiscovery.current.finish(requestController);
      liveLoadInFlight.current = false;
      if (requestController.signal.aborted && located && discoveryGeneration.current === generation) {
        setLiveDiscoveryState('ready');
      }
    }
  }, [coordinates, refreshLocation, reserveDiscoveryRequest, setLiveArea, setLiveVenues]);

  const loadExpandedCategory = useCallback(async (selectedCategory: DiscoveryCategory) => {
    if (
      !coordinates
      || loadedCategories.current.has(selectedCategory)
      || categoryLoadInFlight.current
      || liveLoadInFlight.current
    ) {
      return;
    }
    categoryLoadInFlight.current = true;
    const requestController = foregroundDiscovery.current.begin();
    const generation = discoveryGeneration.current;
    setCategoryLoading(selectedCategory);
    setFeedPageFailure(null);
    try {
      const locationPayload = { lat: coordinates.latitude, lng: coordinates.longitude };
      const page = await fetchLiveSearchPage(
        selectedCategory,
        locationPayload,
        undefined,
        reserveDiscoveryRequest,
        requestController.signal,
      );
      if (discoveryGeneration.current !== generation || !foregroundDiscovery.current.isCurrent(requestController)) return;
      if (page.failure) {
        setFeedPageFailure(page.failure.code);
        setLiveDiscoveryFailure(page.failure.code);
        return;
      }

      let eligible = eligibleSearchPageVenues(
        page.venues,
        coordinates,
        liveArea || 'your location',
        selectedCategory,
      );
      let cursor = advanceLiveSearchCursor({ ringIndex: 0 }, page.nextPageToken);
      let fallbackFailure: DiscoveryPageFailure | undefined;
      while (!eligible.length && hasMoreLiveSearch(cursor)) {
        const request = liveSearchRequest(cursor);
        const usedExpansionRing = request.expansionRingKm !== undefined;
        const nextPage = await fetchLiveSearchPage(
          selectedCategory,
          locationPayload,
          cursor,
          reserveDiscoveryRequest,
          requestController.signal,
        );
        if (discoveryGeneration.current !== generation || !foregroundDiscovery.current.isCurrent(requestController)) return;
        if (nextPage.failure) {
          fallbackFailure = nextPage.failure;
          break;
        }
        eligible = mergeIndexedVenuePages(
          eligible,
          eligibleSearchPageVenues(
            nextPage.venues,
            coordinates,
            liveArea || 'your location',
            selectedCategory,
          ),
        );
        cursor = advanceLiveSearchCursor(cursor!, nextPage.nextPageToken, usedExpansionRing);
      }
      if (hasMoreLiveSearch(cursor)) feedCursors.current.set(selectedCategory, cursor!);
      else feedExhausted.current.add(selectedCategory);
      if (fallbackFailure) setFeedPageFailure(fallbackFailure.code);
      feedVenueIds.current.set(selectedCategory, new Set(eligible.map((venue) => venue.id)));
      loadedCategories.current.add(selectedCategory);
      const merged = mergeIndexedVenuePages(liveVenuesRef.current, eligible);
      setLiveVenues(merged);
      void writeNearbyCache({
        savedAt: Date.now(),
        area: liveArea || 'your location',
        origin: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        venues: merged,
      });
    } catch {
      if (foregroundDiscovery.current.isCurrent(requestController)) setFeedPageFailure('API-RESPONSE');
    } finally {
      foregroundDiscovery.current.finish(requestController);
      categoryLoadInFlight.current = false;
      setCategoryLoading(null);
    }
  }, [coordinates, liveArea, reserveDiscoveryRequest, setLiveVenues]);

  const loadMoreFeed = useCallback(async () => {
    const selectedCategory = category;
    const cursor = feedCursors.current.get(selectedCategory);
    if (
      !coordinates
      || !cursor
      || feedExhausted.current.has(selectedCategory)
      || categoryLoadInFlight.current
      || liveLoadInFlight.current
    ) {
      return;
    }
    categoryLoadInFlight.current = true;
    const requestController = foregroundDiscovery.current.begin();
    setFeedPageLoading(selectedCategory);
    setFeedPageFailure(null);
    const generation = discoveryGeneration.current;
    try {
      const categoryIds = feedVenueIds.current.get(selectedCategory) ?? new Set<string>();
      let nextCursor: LiveSearchCursor | undefined = cursor;
      let eligible: Venue[] = [];
      let failure: DiscoveryPageFailure | undefined;
      while (hasMoreLiveSearch(nextCursor) && !eligible.length) {
        const request = liveSearchRequest(nextCursor);
        const usedExpansionRing = request.expansionRingKm !== undefined;
        const page = await fetchLiveSearchPage(
          selectedCategory,
          { lat: coordinates.latitude, lng: coordinates.longitude },
          nextCursor,
          reserveDiscoveryRequest,
          requestController.signal,
        );
        if (discoveryGeneration.current !== generation || !foregroundDiscovery.current.isCurrent(requestController)) return;
        if (page.failure) {
          failure = page.failure;
          break;
        }
        const pageVenues = eligibleSearchPageVenues(
          page.venues,
          coordinates,
          liveArea || 'your location',
          selectedCategory,
        );
        eligible = pageVenues.filter((venue) => !categoryIds.has(venue.id));
        pageVenues.forEach((venue) => categoryIds.add(venue.id));
        nextCursor = advanceLiveSearchCursor(nextCursor!, page.nextPageToken, usedExpansionRing);
      }
      feedVenueIds.current.set(selectedCategory, categoryIds);
      if (hasMoreLiveSearch(nextCursor)) feedCursors.current.set(selectedCategory, nextCursor!);
      else {
        feedCursors.current.delete(selectedCategory);
        feedExhausted.current.add(selectedCategory);
      }
      if (failure) {
        setFeedPageFailure(failure.code);
        return;
      }
      const merged = mergeIndexedVenuePages(liveVenuesRef.current, eligible);
      setLiveVenues(merged);
      if (eligible.length) {
        void writeNearbyCache({
          savedAt: Date.now(),
          area: liveArea || 'your location',
          origin: { latitude: coordinates.latitude, longitude: coordinates.longitude },
          venues: merged,
        });
      }
    } catch {
      if (foregroundDiscovery.current.isCurrent(requestController)) setFeedPageFailure('API-RESPONSE');
    } finally {
      foregroundDiscovery.current.finish(requestController);
      categoryLoadInFlight.current = false;
      setFeedPageLoading((current) => current === selectedCategory ? null : current);
    }
  }, [category, coordinates, liveArea, reserveDiscoveryRequest, setLiveVenues]);

  const selectCategory = useCallback((nextCategory: TopCategory) => {
    if (nextCategory !== category) {
      foregroundDiscovery.current.cancel();
      if (nextCategory !== 'All') initialDiscovery.current.cancel();
    }
    setCategory(nextCategory);
    if (nextCategory !== 'All') {
      setFeedPageFailure(null);
      void loadExpandedCategory(nextCategory);
    }
  }, [category, loadExpandedCategory]);

  useEffect(() => {
    if (category === 'All' && liveDiscoveryState === 'ready' && !loadedCategories.current.has('All')) {
      void loadLiveVenues(false);
    } else if (category !== 'All' && liveDiscoveryState === 'ready') {
      void loadExpandedCategory(category);
    }
  }, [category, categoryLoading, feedPageLoading, liveDiscoveryState, loadExpandedCategory, loadLiveVenues]);

  useEffect(() => {
    const cursor = feedCursors.current.get(category);
    if (liveDiscoveryState !== 'ready' || !loadedCategories.current.has(category)) return;
    if (!shouldFillDiscovery({
      count: feedVenueIds.current.get(category)?.size ?? 0,
      busy: categoryLoadInFlight.current || liveLoadInFlight.current,
      hasCursor: Boolean(cursor),
      exhausted: feedExhausted.current.has(category),
      attempts: automaticPages.current.get(category) ?? 0,
      retryAt: feedPageFailure ? Number.POSITIVE_INFINITY : 0,
      providerPage: Boolean(cursor?.pageToken),
    })) return;
    automaticPages.current.set(category, (automaticPages.current.get(category) ?? 0) + 1);
    void loadMoreFeed();
  }, [category, liveDiscoveryState, categoryLoading, feedPageLoading, liveVenues, feedPageFailure, loadMoreFeed]);

  useEffect(() => () => {
    foregroundDiscovery.current.cancel();
    initialDiscovery.current.cancel();
  }, []);

  useEffect(() => {
    if (locationStatus === 'ready') {
      void loadLiveVenues(false);
    }
  }, [loadLiveVenues, locationStatus]);

  useEffect(() => {
    if (locationStatus === 'permission-denied') {
      setLiveDiscoveryFailure('LOCATION-DENIED');
      setLiveDiscoveryState('permission-denied');
      if (cachedNearbyAt !== null) {
        setLiveVenues([]);
        setLiveArea('');
        setCachedNearbyAt(null);
        displayedOrigin.current = null;
      }
    } else if (locationStatus === 'unavailable') {
      setLiveDiscoveryFailure('LOCATION-UNAVAILABLE');
      setLiveDiscoveryState('error');
      if (cachedNearbyAt !== null) {
        setLiveVenues([]);
        setLiveArea('');
        setCachedNearbyAt(null);
        displayedOrigin.current = null;
      }
    }
  }, [cachedNearbyAt, locationStatus, setLiveArea, setLiveVenues]);

  useEffect(() => {
    const timer = setInterval(() => {
      const clock = bangingClock();
      setRotationWindow(`${clock.day}:${clock.slot}`);
      setBangingRefreshTick(value => value + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!coordinates) return;
    const controller = new AbortController();
    void loadPartnerVenues(coordinates, controller.signal)
      .then(setPartners)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('[Panda discovery] Partner placements unavailable:', error);
        }
      });
    return () => controller.abort();
  }, [coordinates?.latitude, coordinates?.longitude, rotationWindow]);

  useEffect(() => {
    if (!coordinates) {
      setBangingStatus('Turn on location to find nearby Banging spots.');
      return;
    }
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const originKey = `${coordinates.latitude.toFixed(4)}:${coordinates.longitude.toFixed(4)}`;
    if (bangingOrigin.current !== originKey) {
      bangingOrigin.current = originKey;
      setBangingSupplement([]);
      setBangingPremiumJourneys({});
      setBangingStatus('Finding luxury venues…');
    }
    const premiumIds = partners.venues
      .filter(venue => venue.banging && venue.premium)
      .map(venue => venue.id);
    void getBangingAreaResults(coordinates, premiumIds).then(body => {
      if (!active) return;
      setBangingPremiumJourneys(body.premiumJourneys);
      const additional = body.results.flatMap(result => {
        const venue = venueFromSearchResult(result, 'Nearby');
        const meters = distanceBetween(coordinates, venue);
        if (meters === null) return [];
        return [{
          ...venue,
          neighborhood: result.neighborhood || venue.fullAddress.split(',').slice(-2).join(',').trim() || 'Nearby',
          luxurySource: result.luxurySource,
          bangingTransitMinutes: result.bangingTransitMinutes,
          bangingVerifiedAt: result.bangingVerifiedAt,
          distanceMeters: meters,
          distance: meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`,
          walkingTime: `${result.bangingTransitMinutes} min by public transport`,
          promoted: false,
          premium: false,
          banging: true,
        }];
      }).filter(venue => !partners.tiers[venue.id] && isOrganicBangingVenue(venue)
        && Number.isFinite(venue.distanceMeters) && Boolean(venue.photoNames?.length));
      setBangingSupplement(additional);
      setBangingStatus(body.complete ? '' : 'Limited verified luxury choices in this area');
    }).catch((error: unknown) => {
      if (!active) return;
      console.warn('[Panda Banging] Wider lookup unavailable:', error);
      setBangingStatus('Luxury selection temporarily unavailable · retrying shortly');
      retryTimer = setTimeout(() => setBangingRefreshTick(tick => tick + 1), 65_000);
    });
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [coordinates?.latitude, coordinates?.longitude, partners.venues, partners.tiers, rotationWindow, bangingRefreshTick]);

  const orderedCategories = useMemo(() => {
    return orderDiscoveryCategories(categories, categoryDayPart);
  }, [categoryDayPart]);

  const hasDeferredListings = liveVenues.some(venue => venue.detailsDeferred === true);
  const filteredVenues = useMemo(() => {
    const pageIds = feedVenueIds.current.get(category);
    const livePageVenues = pageIds
      ? liveVenues.filter((venue) => pageIds.has(venue.id))
      : liveVenues;
    const partnerPageVenues = partners.venues.filter(venue => {
      if (!Number.isFinite(venue.distanceMeters)
        || Number(venue.distanceMeters) > MAX_LOCAL_PARTNER_DISTANCE_METERS) return false;
      if (category === 'All') return !['Shop', 'Place of Interest'].includes(venue.category);
      const classification = classifyGooglePlace({
        name: venue.name,
        type: venue.type,
        primaryType: venue.type,
      });
      return classification.categories.includes(category);
    });
    const categoryPageVenues = mergeIndexedVenuePages(livePageVenues, partnerPageVenues);
    const result = categoryPageVenues.filter((venue) => {
      const matchesCategory =
        category === 'All'
          ? venue.category !== 'Shop' && venue.category !== 'Place of Interest'
          : venue.discoveryCategories?.includes(category) === true;
      const matchesPrice = hasDeferredListings || priceFilter === 'Any price' || poundPrice(venue.price) === priceFilter;
      return matchesCategory && matchesPrice;
    });
    return interleavePromotions(result.sort((a, b) =>
      hasDeferredListings || sortBy === 'Nearest'
        ? Number(a.distanceMeters) - Number(b.distanceMeters)
        : Number.parseFloat(b.rating) - Number.parseFloat(a.rating),
    ));
  }, [category, liveVenues, partners.venues, priceFilter, sortBy, hasDeferredListings]);

  const bangingVenues = useMemo(() => rotateBanging([
    ...partners.venues.filter(venue => venue.banging).map(venue => ({
      ...venue,
      ...bangingPremiumJourneys[venue.id],
    })),
    ...bangingSupplement.filter(venue => !partners.tiers[venue.id]).map(venue => ({
      ...venue,
      promoted: false,
      premium: false,
      banging: true,
    })),
  ]), [partners, bangingSupplement, bangingPremiumJourneys, rotationWindow, bangingRefreshTick]);
  useVenueResultAppearances(filteredVenues, 'discovery', !bangingIsOpen,
    `${discoveryGeneration.current}:${category}:${priceFilter}:${sortBy}`);

  const onRefresh = async () => {
    foregroundDiscovery.current.cancel();
    setRefreshing(true);
    await loadLiveVenues(true);
    setRefreshing(false);
  };

  const submitSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    router.push({ pathname: '/ai', params: { prompt: query } });
  };

  const topPadding = Platform.OS === 'web' ? 78 : insets.top + 14;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.fixedHeader, { backgroundColor: colors.ivory, paddingTop: topPadding }]}>
        <BambooBackdrop colors={colors} />
        <View style={styles.headerRow}>
          <PandaWordmark width={150} height={40} />
          <Pressable
            testID="time-planner-shortcut"
            accessibilityLabel={`Plan my ${currentTimeMode}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/', params: { openPlanner: currentTimeMode } })}
            style={({ pressed }) => [
              styles.modePill,
              { backgroundColor: colors.honeySoft, borderColor: colors.goldLine },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.modeDot, { backgroundColor: colors.honey }]} />
            <Text style={[styles.modeText, { color: colors.honeyInk }]}>
              {getPandaTimeEmoji(currentTimeMode)} Plan my {getPandaTimeLabel(currentTimeMode)}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <Feather name="search" size={19} color={colors.green700} />
          <TextInput
            testID="venue-search"
            accessibilityLabel="Search places, cuisines, or a spot by name"
            returnKeyType="search"
            onChangeText={setSearchQuery}
            onSubmitEditing={submitSearch}
            placeholder="Search places, cuisines, a spot by name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
          />
          <Pressable
            testID="venue-search-submit"
            accessibilityLabel="Search with Panda AI"
            accessibilityRole="button"
            disabled={!searchQuery.trim()}
            onPress={submitSearch}
            style={({ pressed }) => [styles.searchSubmit, pressed && styles.pressed]}
          >
            <Feather
              name="arrow-up-right"
              size={17}
              color={searchQuery.trim() ? colors.green700 : colors.border}
            />
          </Pressable>
        </View>
        <View style={styles.topCategoriesHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: colors.green600 }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top categories</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
          decelerationRate="fast"
        >
          <Pressable
            accessibilityLabel="See OpenTable’s verified New restaurant selection"
            accessibilityRole="button"
            onPress={() => router.push('/new-restaurants')}
            style={styles.categoryItem}
            testID="discover-new-restaurants"
          >
            <View style={[styles.categoryIcon, { backgroundColor: colors.mint100, borderColor: colors.border }]}>
              <Feather name="star" size={22} color={colors.green700} />
            </View>
            <Text numberOfLines={1} style={[styles.categoryLabel, { color: colors.mutedForeground }]}>New</Text>
          </Pressable>
          {orderedCategories.map((item) => {
            const active = item.label === category;
              const greenTints = [colors.secondary, colors.mint100, colors.openBackground, colors.muted] as const;
              const tintIndex = orderedCategories.findIndex((categoryItem) => categoryItem.label === item.label);
              const inactiveTint = greenTints[tintIndex % greenTints.length];
            return (
              <Pressable
                key={item.label}
                testID={`category-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => selectCategory(item.label)}
                style={({ pressed }) => [styles.categoryItem, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.categoryIcon,
                    {
                      backgroundColor: active ? colors.honeySoft : inactiveTint,
                      borderColor: active ? colors.goldLine : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.categoryLabel, { color: active ? colors.honeyInk : colors.mutedForeground }]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        viewabilityConfigCallbackPairs={discoveryViewabilityPairs}
        style={styles.feed}
        data={filteredVenues}
        keyExtractor={(item) => item.id}
        numColumns={1}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        onEndReached={() => void loadMoreFeed()}
        onEndReachedThreshold={0.8}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.green700}
            colors={[colors.green700]}
          />
        }
        contentContainerStyle={styles.feedContent}
        ListHeaderComponent={
          <View style={styles.suggestionsHeader}>
            <View style={styles.liveStatusRow}>
              <View
                style={[
                  styles.liveStatusDot,
                  {
                    backgroundColor:
                      liveDiscoveryState === 'ready' ? colors.green600 : colors.goldDeep,
                  },
                ]}
              />
              <Text style={[styles.liveStatusText, { color: colors.mutedForeground }]}>
                {liveDiscoveryState === 'loading'
                  ? liveVenues.length
                    ? `Showing ${cachedNearbyAt ? 'saved' : 'recent'} places near ${liveArea} · updating…`
                    : 'Connecting to live places near you…'
                  : liveDiscoveryState === 'ready'
                     ? cachedNearbyAt !== null
                       ? `Saved nearby places · ${filteredVenues.length} places · hours may have changed`
                       : `Live near ${liveArea} · ${filteredVenues.length} places`
                    : liveVenues.length
                      ? `Showing last results · live update failed (${liveDiscoveryFailure ?? 'UNKNOWN'})`
                    : liveDiscoveryState === 'permission-denied'
                       ? 'Location is off · no venue catalogue substituted'
                       : 'Live places could not load · no venue catalogue substituted'}
              </Text>
              {liveDiscoveryState === 'permission-denied' || liveDiscoveryState === 'error' ? (
                <Pressable
                  accessibilityLabel="Retry live nearby places"
                  accessibilityRole="button"
                  onPress={() => void loadLiveVenues(true)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={[styles.liveRetryText, { color: colors.green700 }]}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionAccent, { backgroundColor: colors.green600 }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    {category === 'All' ? 'Suggestions' : category}
                </Text>
              </View>
              <View style={[styles.filterRow, hasDeferredListings && { display: 'none' }]}>
                <FilterDropdown
                  testID="price-filter"
                  label="price"
                  value={priceFilter}
                  options={['Any price', '£', '££', '£££', '££££']}
                  open={openFilter === 'price'}
                  onToggle={() => setOpenFilter((current) => (current === 'price' ? null : 'price'))}
                  onChange={(value) => {
                    setPriceFilter(value as typeof priceFilter);
                    setOpenFilter(null);
                  }}
                />
                <FilterDropdown
                  testID="sort-filter"
                  label="sort"
                  value={sortBy}
                  options={['Nearest', 'Top rated']}
                  open={openFilter === 'sort'}
                  onToggle={() => setOpenFilter((current) => (current === 'sort' ? null : 'sort'))}
                  onChange={(value) => {
                    setSortBy(value as typeof sortBy);
                    setOpenFilter(null);
                  }}
                />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <SuggestionRow
              venue={item}
              saved={isSaved(item.id)}
              onToggleSaved={() => toggleSaved(item)}
              onPress={() => {
                router.push({
                  pathname: '/venue/[id]',
                  params: {
                    id: item.id,
                    venueData: JSON.stringify(withVenueActivityContext(item, 'discovery')),
                    plannerLocation: liveArea,
                  },
                });
              }}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            {liveDiscoveryState === 'loading' || categoryLoading === category ? (
              <>
                <ActivityIndicator color={colors.green700} size="small" />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {categoryLoading === category ? `Finding ${category.toLowerCase()} places` : 'Finding live places'}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  {categoryLoading === category
                    ? 'Showing the nearest results first while Panda widens the area.'
                    : 'Using your phone’s location to load nearby venues.'}
                </Text>
              </>
            ) : liveDiscoveryState === 'error' || liveDiscoveryState === 'permission-denied' ? (
              <>
                <Ionicons name="cloud-offline-outline" size={28} color={colors.green700} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  Live venues did not load · {liveDiscoveryFailure ?? 'UNKNOWN-STATE'}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  {liveDiscoveryFailure === 'CLIENT-RATE-LIMIT'
                    ? 'Panda has paused extra searches to stay within the service limit. Wait a moment, then retry.'
                    : liveDiscoveryFailure === 'API-RATE-LIMIT'
                      ? 'The live venue service asked this request to slow down. Wait a minute, then retry.'
                      : 'Panda is not showing the built-in London catalogue. Tap Retry to request genuinely nearby places again.'}
                </Text>
                <Text style={[styles.emptyDiagnostic, { color: colors.mutedForeground }]}>
                  Diagnostic: {liveDiscoveryFailure ?? 'UNKNOWN-STATE'}
                </Text>
                <Pressable
                  accessibilityLabel="Retry live nearby places"
                  accessibilityRole="button"
                  onPress={() => void loadLiveVenues(true)}
                  style={({ pressed }) => [
                    styles.emptyRetryButton,
                    { backgroundColor: colors.honey },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.emptyRetryText, { color: colors.honeyInk }]}>Retry live venues</Text>
                </Pressable>
              </>
            ) : feedPageFailure && category !== 'All' ? (
              <>
                <Ionicons name="cloud-offline-outline" size={28} color={colors.green700} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  This category could not load · {feedPageFailure}
                </Text>
                {feedPageFailure === 'CLIENT-RATE-LIMIT' || feedPageFailure === 'API-RATE-LIMIT' ? (
                  <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}
>
                    {feedPageFailure === 'CLIENT-RATE-LIMIT'
                      ? 'Panda has paused extra searches to stay within the service limit. Wait a moment, then retry.'
                      : 'The live venue service asked this request to slow down. Wait a minute, then retry.'}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadExpandedCategory(category)}
                  style={[styles.emptyRetryButton, { backgroundColor: colors.honey }]}
                >
                  <Text style={[styles.emptyRetryText, { color: colors.honeyInk }]}>Retry category</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="search-outline" size={28} color={colors.green700} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {feedCursors.current.has(category) ? 'More nearby places are available' : 'No places found'}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  {feedCursors.current.has(category)
                    ? 'Continue the nearby search to find more matching venues.'
                    : 'Try a different area or category.'}
                </Text>
                {feedCursors.current.has(category) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void loadMoreFeed()}
                    style={[styles.emptyRetryButton, { backgroundColor: colors.honey }]}
                  >
                    <Text style={[styles.emptyRetryText, { color: colors.honeyInk }]}>Find more nearby</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        }
        ListFooterComponent={
          feedPageLoading === category ? (
            <View style={styles.feedFooter} accessibilityLiveRegion="polite" testID="discovery-next-page-loading">
              <ActivityIndicator color={colors.green700} />
              <Text style={[styles.liveStatusText, { color: colors.mutedForeground }]}>
                {filteredVenues.length} places shown · finding more nearby…
              </Text>
            </View>
          ) : feedPageFailure && feedCursors.current.has(category) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMoreFeed()}
              style={styles.feedFooter}
            >
              <Text style={[styles.liveRetryText, { color: colors.green700 }]}>
                Couldn’t load the next page ({feedPageFailure}) · tap to retry
              </Text>
            </Pressable>
          ) : filteredVenues.length > 0 && feedCursors.current.has(category) ? (
            <Pressable
              accessibilityLabel="Load more nearby venues"
              accessibilityRole="button"
              onPress={() => void loadMoreFeed()}
              style={styles.feedFooter}
              testID="discovery-load-more"
            >
              <Text style={[styles.liveRetryText, { color: colors.green700 }]}>Show more nearby</Text>
            </Pressable>
          ) : null
        }
      />
      <BangingDrawer
        onOpenChange={setBangingIsOpen}
        venues={bangingVenues}
        status={bangingStatus}
        isSaved={isSaved}
        onToggleSaved={toggleSaved}
        onPress={(venue) => router.push({
          pathname: '/venue/[id]',
          params: {
            id: venue.id,
            venueData: JSON.stringify(withVenueActivityContext(venue, 'banging')),
            plannerLocation: liveArea,
          },
        })}
      />
      <PandaPlannerSheet
        initialLocation={plannerLocation}
        initialMode={plannerMode}
        initialPlanIds={typeof plannerIds === 'string' ? plannerIds : undefined}
        initialPlanVenues={typeof plannerVenues === 'string' ? plannerVenues : undefined}
        initialPrice={plannerPrice}
        onOpenMap={(plan, mode: PlannerMode, context) =>
          router.push({
            pathname: '/map',
            params: {
              plannerIds: plan.map((venue) => venue.id).join(','),
              plannerMode: mode,
              plannerVenues: JSON.stringify(plan),
              plannerLocation: context.location,
              plannerPrice: context.price,
            },
          })
        }
        onOpenDirections={(venue, context) => {
          recordVenueActivity('directions_click', venue);
          return venue.source === 'openstreetmap'
          ? void Linking.openURL(venue.mapsUri).catch(() => Alert.alert(
              'Directions unavailable',
              'Could not open walking directions for this venue.',
            ))
          : router.push({
              pathname: '/map',
              params: {
                directionsVenueId: venue.id,
                directionsVenueData: JSON.stringify(venue),
                directionsReturn: 'back',
                plannerIds: context.plan.map((item) => item.id).join(','),
                plannerVenues: JSON.stringify(context.plan),
                plannerMode: context.mode,
                plannerPrice: context.price,
                plannerLocation: context.location,
              },
            });
        }
        }
        onOpenVenue={(venue, context) =>
          router.push({
            pathname: '/venue/[id]',
            params: {
              id: venue.id,
              fromPlanner: '1',
              plannerIds: context.plan.map((item) => item.id).join(','),
              plannerVenues: JSON.stringify(context.plan),
              plannerMode: context.mode,
              plannerPrice: context.price,
              plannerLocation: context.location,
            },
          })
        }
        openRequest={openPlanner ? plannerRequest || openPlanner : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fixedHeader: {
    flexShrink: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingBottom: 2,
    position: 'relative',
  },
  content: {
    paddingHorizontal: 18,
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 18,
    paddingBottom: 410,
  },
  suggestionsHeader: {
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modePill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  modeDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  modeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  search: {
    alignItems: 'center',
    borderRadius: 18,
    elevation: 4,
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
    paddingHorizontal: 15,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 50,
    paddingVertical: 0,
  },
  searchSubmit: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    width: 28,
  },
  categories: {
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 17,
    paddingHorizontal: 2,
    paddingTop: 9,
  },
  topCategoriesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  categoryItem: {
    alignItems: 'center',
    gap: 5,
    width: 64,
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    height: 49,
    justifyContent: 'center',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    width: 49,
  },
  categoryEmoji: {
    fontSize: 23,
    lineHeight: 29,
  },
  categoryLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 5,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionAccent: {
    borderRadius: 999,
    height: 21,
    width: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 3,
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  filterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  liveStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 9,
    minHeight: 18,
  },
  liveStatusDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  liveStatusText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  liveRetryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  feedFooter: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  listItem: {
    marginBottom: 0,
    width: '100%',
  },
  listItemLeft: {
    paddingRight: 0,
  },
  listItemRight: {
    paddingLeft: 0,
  },
  empty: {
    alignItems: 'center',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 180,
    padding: 24,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    marginTop: 9,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyDiagnostic: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyRetryButton: {
    borderRadius: 999,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyRetryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  aiFab: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 92,
    elevation: 7,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    width: 58,
  },
  aiFabLabel: {
    borderRadius: 999,
    bottom: -7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: -8,
  },
  aiFabLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});

function BambooBackdrop({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 402 290"
    >
      <Path
        d="M-34 190 C 36 153, 16 93, 76 45 C 110 18, 136 9, 169 -7"
        fill="none"
        opacity={0.16}
        stroke={colors.mint300}
        strokeLinecap="round"
        strokeWidth={15}
      />
      <Path
        d="M-18 264 C 52 222, 62 174, 98 126 C 122 93, 154 73, 191 50"
        fill="none"
        opacity={0.12}
        stroke={colors.mint300}
        strokeLinecap="round"
        strokeWidth={10}
      />
      <Path
        d="M302 4 C 340 30, 364 71, 386 128 C 398 160, 414 186, 440 208"
        fill="none"
        opacity={0.11}
        stroke={colors.secondary}
        strokeLinecap="round"
        strokeWidth={14}
      />
      <Path
        d="M62 75 C 25 40, 24 7, 36 -20 C 71 -11, 91 18, 62 75Z"
        fill={colors.mint100}
        opacity={0.5}
      />
      <Path
        d="M116 118 C 82 91, 80 61, 92 33 C 122 42, 140 68, 116 118Z"
        fill={colors.secondary}
        opacity={0.6}
      />
      <Path
        d="M324 82 C 350 43, 379 35, 407 42 C 397 74, 370 94, 324 82Z"
        fill={colors.mint100}
        opacity={0.64}
      />
      <Path
        d="M294 192 C 322 150, 352 141, 385 151 C 374 185, 345 204, 294 192Z"
        fill={colors.secondary}
        opacity={0.56}
      />
    </Svg>
  );
}
