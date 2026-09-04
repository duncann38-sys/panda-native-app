import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { FilterDropdown } from '@/components/FilterDropdown';
import { PandaPlannerSheet, type PlannerMode } from '@/components/PandaPlannerSheet';
import { PandaWordmark } from '@/components/PandaWordmark';
import { SuggestionRow } from '@/components/SuggestionRow';
import { getPandaTimeEmoji, getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { PANDA_DISCOVERY_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { useSavedVenues } from '@/context/saved-venues';
import { venues, type Venue } from '@/data/venues';
import { classifyGooglePlace, type DiscoveryCategory } from '@/data/venue-categories';
import { useColors } from '@/hooks/useColors';

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
  { label: 'Dessert', emoji: '🍰', terms: ['dessert', 'cake', 'sweet'] },
  { label: 'Coffee', emoji: '☕', terms: ['coffee', 'cafe', 'café'] },
  { label: 'Breakfast', emoji: '🍳', terms: ['breakfast'] },
  { label: 'Lunch', emoji: '🥗', terms: ['lunch'] },
  { label: 'Brunch', emoji: '🥐', terms: ['brunch'] },
  { label: 'Bottomless', emoji: '🍾', terms: ['bottomless'] },
  { label: 'Dinner', emoji: '🍽️', terms: ['dinner', 'restaurant'] },
  { label: 'Drinks', emoji: '🍸', terms: ['drink', 'bar', 'cocktail', 'wine'] },
  { label: 'Sports', emoji: '⚽', terms: ['sport', 'football'] },
  { label: 'Live Music', emoji: '🎵', terms: ['music', 'dj', 'live'] },
  { label: 'Nightlife', emoji: '🌙', terms: ['nightlife', 'club', 'late night'] },
  { label: 'Shops', emoji: '🛍️', terms: [] },
  { label: 'Places of Interest', emoji: '🏛️', terms: [] },
];

const categoryPriority: Record<'morning' | 'midday' | 'evening' | 'late', TopCategory[]> = {
  morning: ['Breakfast', 'Brunch', 'Coffee', 'Lunch', 'Meat', 'Bar'],
  midday: ['Lunch', 'Brunch', 'Bottomless', 'Coffee', 'Dinner', 'Meat', 'Bar'],
  evening: ['Dinner', 'Meat', 'Pubs', 'Bar', 'Drinks', 'Sports', 'Live Music', 'Nightlife'],
  late: ['Nightlife', 'Pubs', 'Bar', 'Drinks', 'Sports', 'Live Music'],
};

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
  distanceMeters?: number;
  types?: string[];
  hasMusic?: boolean;
  sourceQueries?: string[];
  categories?: DiscoveryCategory[];
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
    distanceMeters: finiteNumber(record.distanceMeters),
    types: stringArray(record.types),
    hasMusic: record.hasMusic === true,
    sourceQueries: [...new Set([...stringArray(record.sourceQueries), query])],
    categories: stringArray(record.categories) as DiscoveryCategory[],
  };
}

type LiveDiscoveryState = 'loading' | 'ready' | 'permission-denied' | 'error';
const LIVE_DISCOVERY_QUERIES = [
  'restaurants',
  'bars and pubs',
  'cafes and bakeries',
  'breakfast and brunch',
  'cocktail bars and nightclubs',
  'dessert and ice cream',
  'fast food and takeaways',
  'wine bars and gastropubs',
  'bottomless brunch',
  'meat steak and grill restaurants',
  'sports bars showing live football',
  'live music venues bars',
  'shops off licences and food stores',
  'museums parks landmarks and tourist attractions',
] as const;
const LIVE_DISCOVERY_PAGES_PER_QUERY = 3;
const LIVE_DISCOVERY_LIMIT = 300;
const CATEGORY_MINIMUM = 100;
const CATEGORY_DISCOVERY_LIMIT = 300;
const MAX_DISCOVERY_DISTANCE_METERS = 20_000;
const MAX_CATEGORY_DISTANCE_METERS = 20_000;
const EXPANSION_RING_KM = [2, 4, 7, 10, 15, 20] as const;
const DISCOVERY_CACHE_TTL_MS = 30 * 60 * 1000;
const DISCOVERY_CACHE_PREFIX = 'panda-live-discovery-v2';
const SINGLE_PAGE_DISCOVERY_QUERIES = new Set<string>([
  'bottomless brunch',
  'meat steak and grill restaurants',
  'sports bars showing live football',
  'live music venues bars',
  'shops off licences and food stores',
  'museums parks landmarks and tourist attractions',
]);

const CATEGORY_SEARCH_QUERIES: Partial<Record<DiscoveryCategory, string>> = {
  Indian: 'indian restaurants',
  Italian: 'italian restaurants',
  Chinese: 'chinese restaurants',
  Spanish: 'spanish tapas restaurants',
  French: 'french restaurants',
  British: 'british restaurants',
  Japanese: 'japanese sushi restaurants',
  Mexican: 'mexican restaurants',
  Turkish: 'turkish restaurants',
  Pubs: 'gastropub pub food',
  American: 'american restaurants diners burgers',
  Meat: 'meat steak and grill restaurants',
  Bar: 'cocktail bars wine bars',
  Lebanese: 'lebanese middle eastern levantine restaurants',
  Thai: 'thai restaurants street food',
  Chicken: 'chicken restaurants grilled fried chicken',
  Pizza: 'pizza restaurants',
  Burgers: 'burger restaurants',
  Dessert: 'dessert cake ice cream patisserie',
  Coffee: 'coffee shops cafe',
  Breakfast: 'breakfast cafes brunch morning food',
  Lunch: 'lunch restaurants',
  Brunch: 'brunch restaurants',
  Bottomless: 'bottomless brunch',
  Dinner: 'dinner restaurants',
  Drinks: 'cocktail bars wine bars',
  Sports: 'sports bars showing live football',
  'Live Music': 'live music venues bars',
  Nightlife: 'nightlife clubs live music sports bars entertainment',
  Shops: 'shops off licences and food stores',
  'Places of Interest': 'museums parks landmarks and tourist attractions',
};

type DiscoveryCacheEntry = {
  savedAt: number;
  venues: Venue[];
};

function discoveryCacheKey(
  coordinates: { latitude: number; longitude: number },
  category: TopCategory,
) {
  const latitude = coordinates.latitude.toFixed(2);
  const longitude = coordinates.longitude.toFixed(2);
  return `${DISCOVERY_CACHE_PREFIX}:${latitude}:${longitude}:${category}`;
}

async function readDiscoveryCache(
  coordinates: { latitude: number; longitude: number },
  category: TopCategory,
) {
  try {
    const raw = await AsyncStorage.getItem(discoveryCacheKey(coordinates, category));
    if (!raw) return null;
    const cached = JSON.parse(raw) as DiscoveryCacheEntry;
    if (!Array.isArray(cached.venues) || Date.now() - cached.savedAt > DISCOVERY_CACHE_TTL_MS) {
      return null;
    }
    return cached.venues;
  } catch {
    return null;
  }
}

async function writeDiscoveryCache(
  coordinates: { latitude: number; longitude: number },
  category: TopCategory,
  cachedVenues: Venue[],
) {
  try {
    await AsyncStorage.setItem(
      discoveryCacheKey(coordinates, category),
      JSON.stringify({ savedAt: Date.now(), venues: cachedVenues } satisfies DiscoveryCacheEntry),
    );
  } catch {
    // A full or unavailable device cache must never block live discovery.
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscoveryPage(
  query: string,
  location: { lat: number; lng: number },
  pageToken?: string,
  expansionRingKm?: number,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${PANDA_DISCOVERY_API}/api/panda-ai`,
        20_000,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venuesOnly: true,
            query,
            location,
            ...(pageToken ? { pageToken } : {}),
            ...(expansionRingKm ? { expansionRingKm } : {}),
          }),
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          venues?: unknown;
          nextPageToken?: string;
        };
        return {
          venues: (Array.isArray(payload.venues) ? payload.venues : [])
            .flatMap((venue) => {
              const normalized = normalizeLiveVenueResult(venue, query);
              return normalized ? [normalized] : [];
            }),
          nextPageToken: stringValue(payload.nextPageToken) || undefined,
        };
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch {
      if (attempt === 2) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
  return { venues: [] as LiveVenueResult[], nextPageToken: undefined };
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
  const mapsUri =
    result.directionsLink
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
    walkingTime: distanceMeters ? `≈ ${Math.max(1, Math.round(distanceMeters / 80))} min walk` : 'Directions available',
    rating: Number.isFinite(result.rating) ? result.rating!.toFixed(1) : '',
    ratingCount: Number.isFinite(result.ratingCount) ? result.ratingCount! : 0,
    price: poundPrice(result.price),
    distanceMeters,
    description: `${result.type} near ${area}.`,
    hours: todayHours ?? 'Live hours unavailable',
    feature: result.type,
    fullAddress: result.fullAddress || result.address,
    openNow: result.openNow === true,
    website: result.website || result.menuLink || mapsUri,
    mapsUri,
    phone: result.phone ?? '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: result.photoAttribution ? [result.photoAttribution] : [],
    photoName: result.photoName,
    photoCount: Number.isFinite(result.photoCount) ? result.photoCount! : 0,
    discoveryCategories: [...new Set([
      ...classification.categories,
      ...stringArray(result.categories) as DiscoveryCategory[],
    ])],
  };
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openPlanner, plannerIds, plannerLocation, plannerPrice } = useLocalSearchParams<{
    openPlanner?: string;
    plannerIds?: string;
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
  const [categoryLoading, setCategoryLoading] = useState<DiscoveryCategory | null>(null);
  const loadedCategories = useRef(new Set<DiscoveryCategory>());
  const loadLiveVenues = useCallback(async (requestPermission: boolean) => {
    setLiveDiscoveryState('loading');
    loadedCategories.current.clear();
    let hasPublishedVenues = false;
    try {
      const location = requestPermission || !coordinates
        ? await refreshLocation(requestPermission)
        : { status: 'ready' as const, coordinates };
      if (location.status !== 'ready') {
        setLiveVenues([]);
        setLiveDiscoveryState(location.status === 'permission-denied' ? 'permission-denied' : 'error');
        return;
      }

      let area = 'Nearby';
      try {
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
      } catch {
        // Coordinates are enough for discovery; Android geocoding can be temporarily unavailable.
      }

      if (!requestPermission) {
        const cached = await readDiscoveryCache(location.coordinates, 'All');
        if (cached?.length) {
          setLiveArea(area);
          setLiveVenues(cached);
          setLiveDiscoveryState('ready');
          return;
        }
      }

      const locationPayload = {
        lat: location.coordinates.latitude,
        lng: location.coordinates.longitude,
      };
      const origin = {
        latitude: location.coordinates.latitude,
        longitude: location.coordinates.longitude,
      };
      const uniqueResults = new Map<string, LiveVenueResult>();
      const mergeResults = (results: LiveVenueResult[]) => {
        results.forEach((result) => {
          if (!result.id) return;
          const existing = uniqueResults.get(result.id);
          if (!existing) {
            uniqueResults.set(result.id, result);
            return;
          }
          uniqueResults.set(result.id, {
            ...existing,
            sourceQueries: [...new Set([...stringArray(existing.sourceQueries), ...stringArray(result.sourceQueries)])],
            categories: [...new Set([
              ...stringArray(existing.categories),
              ...stringArray(result.categories),
            ])] as DiscoveryCategory[],
          });
        });
      };
      const visibleVenues = () => {
        const eligibleResults = [...uniqueResults.values()].flatMap((result) => {
          if (
            !result.id
            || !result.name
            || !Number.isFinite(result.lat)
            || !Number.isFinite(result.lng)
          ) {
            return [];
          }
          const venue = liveVenueFromResult(result, origin, area);
          return venue.distanceMeters <= MAX_DISCOVERY_DISTANCE_METERS ? [{ result, venue }] : [];
        }).sort((a, b) => a.venue.distanceMeters - b.venue.distanceMeters);
        const hospitalityResults = eligibleResults
          .filter(({ venue }) => venue.category !== 'Shop' && venue.category !== 'Place of Interest')
          .slice(0, LIVE_DISCOVERY_LIMIT);
        const supportingResults = eligibleResults
          .filter(({ venue }) => venue.category === 'Shop' || venue.category === 'Place of Interest')
          .slice(0, 120);
        return [...hospitalityResults, ...supportingResults].map(({ venue }) => venue);
      };
      const publishVisibleVenues = () => {
        const nextVenues = visibleVenues();
        if (!nextVenues.length) return false;
        setLiveArea(area);
        setLiveVenues(nextVenues);
        setLiveDiscoveryState('ready');
        hasPublishedVenues = true;
        return true;
      };

      const firstPage = await fetchDiscoveryPage('restaurants', locationPayload);
      mergeResults(firstPage.venues);
      publishVisibleVenues();

      const remainingQueries = LIVE_DISCOVERY_QUERIES.filter((query) => query !== 'restaurants');
      const queryTasks: Array<() => Promise<void>> = [
        async () => {
          let pageToken = firstPage.nextPageToken;
          for (let page = 1; page < LIVE_DISCOVERY_PAGES_PER_QUERY && pageToken; page += 1) {
            const payload = await fetchDiscoveryPage('restaurants', locationPayload, pageToken);
            mergeResults(payload.venues);
            publishVisibleVenues();
            pageToken = payload.nextPageToken;
          }
        },
        ...remainingQueries.map((query) => async () => {
          let pageToken: string | undefined;
          const pageLimit = SINGLE_PAGE_DISCOVERY_QUERIES.has(query) ? 1 : LIVE_DISCOVERY_PAGES_PER_QUERY;
          for (let page = 0; page < pageLimit; page += 1) {
            const payload = await fetchDiscoveryPage(query, locationPayload, pageToken);
            mergeResults(payload.venues);
            publishVisibleVenues();
            pageToken = payload.nextPageToken;
            if (!pageToken) break;
          }
        }),
      ];

      for (let offset = 0; offset < queryTasks.length; offset += 3) {
        await Promise.all(queryTasks.slice(offset, offset + 3).map(async (task) => {
          try {
            await task();
          } catch {
            // One failed query must not discard successful venue batches.
          }
        }));
      }

      const nextVenues = visibleVenues();
      if (!nextVenues.length) throw new Error('No live venues returned');
      setLiveArea(area);
      setLiveVenues(nextVenues);
      setLiveDiscoveryState('ready');
      void writeDiscoveryCache(location.coordinates, 'All', nextVenues);
    } catch {
      if (!hasPublishedVenues) {
        setLiveVenues([]);
        setLiveDiscoveryState('error');
      }
    }
  }, [coordinates, refreshLocation, setLiveArea, setLiveVenues]);

  const loadExpandedCategory = useCallback(async (selectedCategory: DiscoveryCategory) => {
    if (
      !coordinates
      || !liveArea
      || loadedCategories.current.has(selectedCategory)
      || categoryLoading === selectedCategory
    ) {
      return;
    }
    const query = CATEGORY_SEARCH_QUERIES[selectedCategory];
    if (!query) return;

    setCategoryLoading(selectedCategory);
    const origin = coordinates;
    const cached = await readDiscoveryCache(origin, selectedCategory);
    if (cached?.length) {
      setLiveVenues((current) => {
        const merged = new Map(current.map((venue) => [venue.id, venue]));
        cached.forEach((venue) => merged.set(venue.id, venue));
        return [...merged.values()];
      });
      loadedCategories.current.add(selectedCategory);
      setCategoryLoading(null);
      return;
    }
    const collected = new Map<string, LiveVenueResult>();
    const mergeResults = (results: LiveVenueResult[]) => {
      results.forEach((result) => {
        if (!result.id) return;
        const existing = collected.get(result.id);
        collected.set(result.id, existing
          ? {
              ...existing,
              ...result,
              sourceQueries: [...new Set([
                ...stringArray(existing.sourceQueries),
                ...stringArray(result.sourceQueries),
              ])],
              categories: [...new Set([
                ...stringArray(existing.categories),
                ...stringArray(result.categories),
              ])] as DiscoveryCategory[],
            }
          : result);
      });
    };
    const eligibleVenues = () => [...collected.values()].flatMap((result) => {
      if (
        !Number.isFinite(result.lat)
        || !Number.isFinite(result.lng)
      ) {
        return [];
      }
      const venue = liveVenueFromResult(result, origin, liveArea);
      return venue.distanceMeters <= MAX_CATEGORY_DISTANCE_METERS
        && venue.discoveryCategories?.includes(selectedCategory)
        ? [venue]
        : [];
    });

    try {
      let pageToken: string | undefined;
      for (let page = 0; page < LIVE_DISCOVERY_PAGES_PER_QUERY; page += 1) {
        const payload = await fetchDiscoveryPage(
          query,
          { lat: origin.latitude, lng: origin.longitude },
          pageToken,
        );
        mergeResults(payload.venues);
        pageToken = payload.nextPageToken;
        if (!pageToken) break;
      }

      for (const radiusKm of EXPANSION_RING_KM) {
        if (eligibleVenues().length >= CATEGORY_MINIMUM) break;
        const batch = await fetchDiscoveryPage(
          query,
          { lat: origin.latitude, lng: origin.longitude },
          undefined,
          radiusKm,
        );
        mergeResults(batch.venues);
      }

      const expanded = eligibleVenues()
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, CATEGORY_DISCOVERY_LIMIT);
      void writeDiscoveryCache(origin, selectedCategory, expanded);
      setLiveVenues((current) => {
        const merged = new Map(current.map((venue) => [venue.id, venue]));
        expanded.forEach((venue) => {
          const existing = merged.get(venue.id);
          merged.set(venue.id, existing
            ? {
                ...existing,
                ...venue,
                discoveryCategories: [...new Set([
                  ...(existing.discoveryCategories ?? []),
                  ...(venue.discoveryCategories ?? []),
                ])],
              }
            : venue);
        });
        return [...merged.values()];
      });
      loadedCategories.current.add(selectedCategory);
    } finally {
      setCategoryLoading(null);
    }
  }, [categoryLoading, coordinates, liveArea, setLiveVenues]);

  const selectCategory = useCallback((nextCategory: TopCategory) => {
    setCategory(nextCategory);
    if (nextCategory !== 'All') void loadExpandedCategory(nextCategory);
  }, [loadExpandedCategory]);

  useEffect(() => {
    if (locationStatus === 'ready') {
      void loadLiveVenues(false);
    } else if (locationStatus === 'permission-denied') {
      setLiveDiscoveryState('permission-denied');
    } else if (locationStatus === 'unavailable') {
      setLiveDiscoveryState('error');
    }
  }, [loadLiveVenues, locationStatus]);

  const orderedCategories = useMemo(() => {
    const hour = new Date().getHours();
    const timeKey = hour < 11 ? 'morning' : hour < 16 ? 'midday' : hour < 23 ? 'evening' : 'late';
    const priority = categoryPriority[timeKey];
    const rank = (label: TopCategory) => {
      const position = priority.indexOf(label);
      return position === -1 ? Number.MAX_SAFE_INTEGER : position;
    };
    return [
      categories[0],
      ...categories
        .slice(1)
        .sort((first, second) => rank(first.label) - rank(second.label)),
    ];
  }, []);

  const filteredVenues = useMemo(() => {
    const result = liveVenues.filter((venue) => {
      const matchesCategory =
        category === 'All'
          ? venue.category !== 'Shop' && venue.category !== 'Place of Interest'
          : venue.discoveryCategories?.includes(category) === true;
      const matchesPrice = priceFilter === 'Any price' || poundPrice(venue.price) === priceFilter;
      return matchesCategory && matchesPrice;
    });
    return result.sort((a, b) =>
      sortBy === 'Nearest'
        ? Number(a.distanceMeters) - Number(b.distanceMeters)
        : Number.parseFloat(b.rating) - Number.parseFloat(a.rating),
    );
  }, [category, liveVenues, priceFilter, sortBy]);

  const onRefresh = async () => {
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
        style={styles.feed}
        data={filteredVenues}
        keyExtractor={(item) => item.id}
        numColumns={1}
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
                  ? 'Connecting to live places near you…'
                  : liveDiscoveryState === 'ready'
                     ? `Live near ${liveArea} · ${liveVenues.length} places`
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
                  {categoryLoading === category
                    ? `Finding more ${category.toLowerCase()} nearby…`
                    : category === 'All' ? 'Nearby hospitality venues' : category}
                </Text>
              </View>
              <View style={styles.filterRow}>
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
                if (!liveVenues.some((venue) => venue.id === item.id)) {
                  router.push(`/venue/${item.id}`);
                  return;
                }
                router.push({
                  pathname: '/venue/[id]',
                  params: {
                    id: item.id,
                    venueData: JSON.stringify(item),
                    plannerLocation: liveArea,
                  },
                });
              }}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            {liveDiscoveryState === 'loading' ? (
              <>
                <ActivityIndicator color={colors.green700} size="small" />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Finding live places</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Using your phone’s location to load nearby venues.
                </Text>
              </>
            ) : liveDiscoveryState === 'error' || liveDiscoveryState === 'permission-denied' ? (
              <>
                <Ionicons name="cloud-offline-outline" size={28} color={colors.green700} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Live venues did not load</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Panda is not showing the built-in London catalogue. Tap Retry to request genuinely nearby places again.
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
            ) : (
              <>
                <Ionicons name="search-outline" size={28} color={colors.green700} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No places found</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  Try a different area, category, or search term.
                </Text>
              </>
            )}
          </View>
        }
      />
      <BangingDrawer
        venues={venues}
        isSaved={isSaved}
        onToggleSaved={toggleSaved}
        onPress={(venue) => router.push(`/venue/${venue.id}`)}
      />
      <PandaPlannerSheet
        initialLocation={plannerLocation}
        initialMode={plannerMode}
        initialPlanIds={typeof plannerIds === 'string' ? plannerIds : undefined}
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
        onOpenDirections={(venue, context) =>
          router.push({
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
          })
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
        openRequest={openPlanner}
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
