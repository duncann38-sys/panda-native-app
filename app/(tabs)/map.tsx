import { Feather, Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VenuePhoto } from '@/components/VenuePhoto';
import NativeGoogleMap from '@/components/NativeGoogleMap';
import PandaRouteSheet, { type WalkingStep } from '@/components/PandaRouteSheet';
import { PANDA_RUNTIME_API } from '@/constants/services';
import { useLiveVenues } from '@/context/live-venues';
import { venues, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { decodeRoutePolyline, distanceBetweenCoordinates } from '@/utils/route-geometry';

type Percentage = `${number}%`;

type TransitStep = {
  mode: 'WALK' | 'TRANSIT';
  instruction: string;
  durationMinutes: number;
  distanceMeters: number;
  lineName: string | null;
  headsign: string | null;
  departureStop: string | null;
  arrivalStop: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  liveDepartureTime?: string | null;
  liveUpdatedAt?: string | null;
  platform?: string | null;
  polyline?: string;
};

type TransitRouteContext = {
  originName: string;
  destinationName: string;
  originWalkMinutes: string;
  originWalkDistance: string;
  durationMinutes: string;
  distanceMeters: string;
  steps: TransitStep[];
  walkMinutes: string;
  walkDistance: string;
  originPolyline: string;
  polyline: string;
  destinationPolyline: string;
  updatedAt?: string;
};

const GOOGLE_MAP_CENTER = '51.49,-0.14';
const CARD_WIDTH = 292;
const RAIL_GAP = 12;

const markerLayout: Array<{ left: Percentage; top: Percentage; price: string }> = [
  { left: '15%', top: '27%', price: '£££' },
  { left: '30%', top: '20%', price: '££' },
  { left: '42%', top: '39%', price: '££' },
  { left: '57%', top: '24%', price: '£££' },
  { left: '73%', top: '18%', price: '££' },
  { left: '84%', top: '44%', price: '£' },
  { left: '64%', top: '54%', price: '££' },
  { left: '48%', top: '62%', price: '££' },
  { left: '31%', top: '70%', price: '££' },
  { left: '77%', top: '72%', price: '££' },
  { left: '17%', top: '80%', price: '££' },
  { left: '91%', top: '65%', price: '£££' },
];

function parseTransitSteps(value: string): TransitStep[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 24).flatMap((step) => {
      if (
        !step
        || typeof step !== 'object'
        || !('mode' in step)
        || !('instruction' in step)
        || !('durationMinutes' in step)
        || !('distanceMeters' in step)
        || (step.mode !== 'WALK' && step.mode !== 'TRANSIT')
        || typeof step.instruction !== 'string'
        || typeof step.durationMinutes !== 'number'
        || typeof step.distanceMeters !== 'number'
      ) {
        return [];
      }

      return [{
        mode: step.mode,
        instruction: step.instruction,
        durationMinutes: step.durationMinutes,
        distanceMeters: step.distanceMeters,
        lineName: 'lineName' in step && typeof step.lineName === 'string' ? step.lineName : null,
        headsign: 'headsign' in step && typeof step.headsign === 'string' ? step.headsign : null,
        departureStop:
          'departureStop' in step && typeof step.departureStop === 'string' ? step.departureStop : null,
        arrivalStop: 'arrivalStop' in step && typeof step.arrivalStop === 'string' ? step.arrivalStop : null,
        departureTime: 'departureTime' in step && typeof step.departureTime === 'string' ? step.departureTime : null,
        arrivalTime: 'arrivalTime' in step && typeof step.arrivalTime === 'string' ? step.arrivalTime : null,
        liveDepartureTime: 'liveDepartureTime' in step && typeof step.liveDepartureTime === 'string' ? step.liveDepartureTime : null,
        liveUpdatedAt: 'liveUpdatedAt' in step && typeof step.liveUpdatedAt === 'string' ? step.liveUpdatedAt : null,
        platform: 'departurePlatform' in step && typeof step.departurePlatform === 'string'
          ? step.departurePlatform : 'platform' in step && typeof step.platform === 'string' ? step.platform : null,
        polyline: 'polyline' in step && typeof step.polyline === 'string' ? step.polyline : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function parsePlannerVenueData(value: string): Venue[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((venue): venue is Venue => (
      Boolean(venue)
      && typeof venue === 'object'
      && 'id' in venue
      && typeof venue.id === 'string'
      && 'name' in venue
      && typeof venue.name === 'string'
      && 'fullAddress' in venue
      && typeof venue.fullAddress === 'string'
    ));
  } catch {
    return [];
  }
}

function parseDirectionsVenueData(value: string): Venue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !parsed
      || typeof parsed !== 'object'
      || !('id' in parsed)
      || typeof parsed.id !== 'string'
      || !('name' in parsed)
      || typeof parsed.name !== 'string'
      || !('fullAddress' in parsed)
      || typeof parsed.fullAddress !== 'string'
    ) {
      return null;
    }
    return parsed as Venue;
  } catch {
    return null;
  }
}

function parseMapCoordinate(value: string): { latitude: number; longitude: number } | null {
  const parts = value.split(',');
  if (parts.length !== 2 || parts.some((part) => !part.trim())) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function parseWalkingSteps(value: unknown): WalkingStep[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).flatMap((step): WalkingStep[] => {
    if (!step || typeof step !== 'object') return [];
    const item = step as Partial<WalkingStep>;
    const end = item.endLocation;
    if (typeof item.instruction !== 'string' || !item.instruction.trim()
      || typeof item.distanceMeters !== 'number' || !Number.isFinite(item.distanceMeters)
      || typeof item.durationMinutes !== 'number' || !Number.isFinite(item.durationMinutes)
      || !end || typeof end.latitude !== 'number' || typeof end.longitude !== 'number'
      || !Number.isFinite(end.latitude) || !Number.isFinite(end.longitude)
      || Math.abs(end.latitude) > 90 || Math.abs(end.longitude) > 180) return [];
    return [{
      instruction: item.instruction.slice(0, 300),
      distanceMeters: Math.max(0, item.distanceMeters),
      durationMinutes: Math.max(0, item.durationMinutes),
      endLocation: { latitude: end.latitude, longitude: end.longitude },
    }];
  });
}

export default function MapScreen() {
  const colors = useColors();
  const router = useRouter();
  const { coordinates, liveArea, liveVenues, refreshLocation } = useLiveVenues();
  const {
    directionsVenueData,
    directionsVenueId,
    directionsReturn,
    plannerIds,
    plannerVenues: plannerVenueData,
    plannerLocation,
    plannerMode,
    plannerPrice,
    transitOriginName,
    transitDestinationName,
    transitOriginCoordinates,
    transitDestinationCoordinates,
    transitOriginPolyline,
    transitPolyline,
    transitDestinationPolyline,
    transitOriginWalkMinutes,
    transitOriginWalkDistance,
    transitDurationMinutes,
    transitDistanceMeters,
    transitSteps,
    transitWalkMinutes,
    transitWalkDistance,
    transitUpdatedAt,
  } = useLocalSearchParams<{
    directionsVenueData?: string;
    directionsVenueId?: string;
    directionsReturn?: 'back' | 'map';
    plannerIds?: string;
    plannerVenues?: string;
    plannerLocation?: string;
    plannerMode?: string;
    plannerPrice?: string;
    transitOriginName?: string;
    transitDestinationName?: string;
    transitOriginCoordinates?: string;
    transitDestinationCoordinates?: string;
    transitOriginPolyline?: string;
    transitPolyline?: string;
    transitDestinationPolyline?: string;
    transitOriginWalkMinutes?: string;
    transitOriginWalkDistance?: string;
    transitDurationMinutes?: string;
    transitDistanceMeters?: string;
    transitSteps?: string;
    transitWalkMinutes?: string;
    transitWalkDistance?: string;
    transitUpdatedAt?: string;
  }>();
  const insets = useSafeAreaInsets();
  const railRef = useRef<ScrollView>(null);
  const dynamicPlannerVenues = useMemo(
    () => parsePlannerVenueData(String(plannerVenueData || '')),
    [plannerVenueData],
  );
  const dynamicDirectionsVenue = useMemo(
    () => parseDirectionsVenueData(String(directionsVenueData || '')),
    [directionsVenueData],
  );
  const plannerVenues = useMemo(() => {
    if (dynamicPlannerVenues.length) return dynamicPlannerVenues;
    const ids = String(plannerIds || '')
      .split(',')
      .filter(Boolean);
    return ids.map((id) => venues.find((venue) => venue.id === id)).filter((venue): venue is Venue => Boolean(venue));
  }, [dynamicPlannerVenues, plannerIds]);
  const plannerContextAvailable = plannerVenues.length > 0;
  const plannerActive = plannerContextAvailable && !directionsVenueId;
  const baseDiscoveryVenues = liveVenues;
  const discoveryVenues = useMemo(
    () => dynamicDirectionsVenue && !baseDiscoveryVenues.some((venue) => venue.id === dynamicDirectionsVenue.id)
      ? [dynamicDirectionsVenue, ...baseDiscoveryVenues]
      : baseDiscoveryVenues,
    [dynamicDirectionsVenue, baseDiscoveryVenues],
  );
  const mapVenues = plannerActive ? plannerVenues : discoveryVenues;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstId = String(plannerIds || '').split(',')[0];
    const requestedVenueId = String(directionsVenueId || firstId);
    return Math.max(0, mapVenues.findIndex((venue) => venue.id === requestedVenueId));
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [resultsRailVisible, setResultsRailVisible] = useState(false);
  const [directionsVenue, setDirectionsVenue] = useState<Venue | null>(() =>
    dynamicDirectionsVenue
    ?? mapVenues.find((venue) => venue.id === String(directionsVenueId || ''))
    ?? null,
  );
  const [routeMode, setRouteMode] = useState<'walking' | 'transit'>(
    transitOriginName && transitDestinationName ? 'transit' : 'walking',
  );
  type WalkingRoute = { distanceMeters: number; durationMinutes: number; polyline?: string; steps?: WalkingStep[] };
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationStepIndex, setNavigationStepIndex] = useState(0);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [navigationPosition, setNavigationPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navigationOrigin, setNavigationOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastStepAdvanceAt = useRef(0);
  const [freshTransit, setFreshTransit] = useState<{
    venueId: string;
    route: TransitRouteContext;
    stations: {
      origin: { name: string; coordinate: { latitude: number; longitude: number } };
      destination: { name: string; coordinate: { latitude: number; longitude: number } };
    };
  } | null>(null);
  const [transitRefreshing, setTransitRefreshing] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);
  const [walkingRouteResult, setWalkingRouteResult] = useState<{
    key: string; route: WalkingRoute;
  } | null>(null);
  const walkingRouteCache = useRef(new Map<string, WalkingRoute>());
  const walkingOrigin = navigationOrigin ?? coordinates;
  const walkingRouteKey = directionsVenue && walkingOrigin && routeMode === 'walking'
    && directionsVenue.id.startsWith('ChIJ')
    ? `${directionsVenue.id}:${walkingOrigin.latitude.toFixed(4)}:${walkingOrigin.longitude.toFixed(4)}`
    : null;
  const walkingRoute = walkingRouteResult?.key === walkingRouteKey
    ? walkingRouteResult.route
    : null;
  const selectedVenue = mapVenues[selectedIndex % mapVenues.length];
  const parsedTransitSteps = useMemo(
    () => parseTransitSteps(String(transitSteps || '')),
    [transitSteps],
  );
  const parameterTransitRoute: TransitRouteContext | null =
    transitOriginName && transitDestinationName
      && directionsVenue?.id === String(directionsVenueId || '')
      ? {
          originName: String(transitOriginName),
          destinationName: String(transitDestinationName),
          originWalkMinutes: String(transitOriginWalkMinutes || ''),
          originWalkDistance: String(transitOriginWalkDistance || ''),
          durationMinutes: String(transitDurationMinutes || ''),
          distanceMeters: String(transitDistanceMeters || ''),
          steps: parsedTransitSteps,
          walkMinutes: String(transitWalkMinutes || ''),
          walkDistance: String(transitWalkDistance || ''),
           originPolyline: String(transitOriginPolyline || ''),
           polyline: String(transitPolyline || ''),
           destinationPolyline: String(transitDestinationPolyline || ''),
           updatedAt: String(transitUpdatedAt || ''),
        }
      : null;
  const transitRoute = freshTransit && freshTransit.venueId === directionsVenue?.id
    ? freshTransit.route : parameterTransitRoute;
  const stationCoordinates = useMemo(() => {
    if (freshTransit && freshTransit.venueId === directionsVenue?.id) return freshTransit.stations;
    const origin = parseMapCoordinate(String(transitOriginCoordinates || ''));
    const destination = parseMapCoordinate(String(transitDestinationCoordinates || ''));
    return origin && destination && transitRoute
      ? {
          origin: { name: transitRoute.originName, coordinate: origin },
          destination: { name: transitRoute.destinationName, coordinate: destination },
        }
      : null;
  }, [freshTransit, directionsVenue?.id, transitOriginCoordinates, transitDestinationCoordinates,
    transitRoute?.originName, transitRoute?.destinationName]);
  const routeSegments = useMemo(() => {
    if (!directionsVenue) return [];
    if (routeMode === 'walking') {
      return walkingRoute?.polyline
        ? [{ encoded: walkingRoute.polyline, mode: 'walking' as const }]
        : [];
    }
    if (!transitRoute) return [];
    const stepSegments = transitRoute.steps.flatMap((step) => step.polyline
      ? [{ encoded: step.polyline, mode: step.mode === 'TRANSIT' ? 'transit' as const : 'walking' as const }]
      : []);
    if (stepSegments.some((segment) => segment.mode === 'transit')) return stepSegments;
    return [
      { encoded: transitRoute.originPolyline, mode: 'walking' as const },
      { encoded: transitRoute.polyline, mode: 'transit' as const },
      { encoded: transitRoute.destinationPolyline, mode: 'walking' as const },
    ].filter((segment) => Boolean(segment.encoded));
  }, [directionsVenue?.id, routeMode, walkingRoute?.polyline,
    transitRoute?.originPolyline, transitRoute?.polyline, transitRoute?.destinationPolyline, transitRoute?.steps]);
  const hasMappedRoute = Platform.OS !== 'web'
    && routeSegments.some((segment) => decodeRoutePolyline(segment.encoded).length > 1);

  useEffect(() => {
    if (!walkingRouteKey || !directionsVenue || !walkingOrigin) {
      setWalkingRouteResult(null);
      return;
    }
    const cached = walkingRouteCache.current.get(walkingRouteKey);
    if (cached) {
      setWalkingRouteResult({ key: walkingRouteKey, route: cached });
      return;
    }
    const controller = new AbortController();
    setWalkingRouteResult(null);
    const url = `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(directionsVenue.id)}/walking`
      + `?latitude=${encodeURIComponent(walkingOrigin.latitude)}&longitude=${encodeURIComponent(walkingOrigin.longitude)}`;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('distanceMeters' in data)
          || !('durationMinutes' in data) || typeof data.distanceMeters !== 'number'
          || typeof data.durationMinutes !== 'number') return null;
        return {
          distanceMeters: data.distanceMeters,
          durationMinutes: data.durationMinutes,
          polyline: 'polyline' in data && typeof data.polyline === 'string' ? data.polyline : undefined,
          steps: 'steps' in data ? parseWalkingSteps(data.steps) : [],
        };
      })
      .then((route) => {
        if (!controller.signal.aborted && route) {
          walkingRouteCache.current.set(walkingRouteKey, route);
          setWalkingRouteResult({ key: walkingRouteKey, route });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [walkingRouteKey]);

  const refreshTransit = useCallback(async () => {
    const venueId = directionsVenue?.id;
    if (!venueId?.startsWith('ChIJ') || transitRefreshing) return;
    setTransitRefreshing(true);
    setTransitError(null);
    try {
      const location = coordinates
        ? { status: 'ready' as const, coordinates }
        : await refreshLocation(true);
      if (location.status !== 'ready') {
        throw new Error(location.status === 'permission-denied'
          ? 'Allow location access to find nearby departures.'
          : 'Your current location is unavailable. Please try again.');
      }
      const url = `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(venueId)}/transit`
        + `?latitude=${encodeURIComponent(location.coordinates.latitude)}`
        + `&longitude=${encodeURIComponent(location.coordinates.longitude)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status === 429
        ? 'Please wait a moment before refreshing departures.'
        : 'Transit connections are unavailable right now.');
      const data = await response.json() as {
        originStation?: { name?: string; latitude?: number; longitude?: number };
        destinationStation?: { name?: string; latitude?: number; longitude?: number };
        originWalk?: { durationMinutes?: number; distanceMeters?: number; polyline?: string } | null;
        transitRoute?: {
          durationMinutes?: number; distanceMeters?: number; steps?: unknown[];
          polyline?: string; updatedAt?: string;
        } | null;
        venueWalk?: { durationMinutes?: number; distanceMeters?: number; polyline?: string } | null;
        updatedAt?: string;
      };
      const origin = data.originStation;
      const destination = data.destinationStation;
      const route = data.transitRoute;
      if (!origin?.name || !destination?.name
        || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)
        || !Number.isFinite(destination.latitude) || !Number.isFinite(destination.longitude)
        || typeof route?.durationMinutes !== 'number' || !Array.isArray(route.steps)) {
        throw new Error('No usable public transport journey was found.');
      }
      const parsed = parseTransitSteps(JSON.stringify(route.steps));
      if (!parsed.some((step) => step.mode === 'TRANSIT')) {
        throw new Error('No public transport connection was found.');
      }
      setFreshTransit({
        venueId,
        route: {
          originName: origin.name,
          destinationName: destination.name,
          originWalkMinutes: String(data.originWalk?.durationMinutes ?? ''),
          originWalkDistance: String(data.originWalk?.distanceMeters ?? ''),
          durationMinutes: String(route.durationMinutes),
          distanceMeters: String(route.distanceMeters ?? ''),
          steps: parsed,
          walkMinutes: String(data.venueWalk?.durationMinutes ?? ''),
          walkDistance: String(data.venueWalk?.distanceMeters ?? ''),
          originPolyline: data.originWalk?.polyline ?? '',
          polyline: route.polyline ?? '',
          destinationPolyline: data.venueWalk?.polyline ?? '',
          updatedAt: route.updatedAt ?? data.updatedAt,
        },
        stations: {
          origin: { name: origin.name, coordinate: { latitude: origin.latitude!, longitude: origin.longitude! } },
          destination: {
            name: destination.name,
            coordinate: { latitude: destination.latitude!, longitude: destination.longitude! },
          },
        },
      });
    } catch (error) {
      setTransitError(error instanceof Error ? error.message : 'Transit connections are unavailable right now.');
    } finally {
      setTransitRefreshing(false);
    }
  }, [coordinates, directionsVenue?.id, refreshLocation, transitRefreshing]);

  useEffect(() => {
    if (!directionsVenue || routeMode !== 'transit' || !coordinates) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refreshTransit();
    }, 60_000);
    return () => clearInterval(timer);
  }, [coordinates, directionsVenue?.id, routeMode, refreshTransit]);

  const stopNavigation = () => {
    setNavigationActive(false);
    setNavigationPosition(null);
    setNavigationOrigin(null);
    setNavigationStepIndex(0);
    setNavigationError(null);
  };

  useEffect(() => {
    if (!navigationActive || routeMode !== 'walking' || Platform.OS === 'web') return;
    let stopped = false;
    let subscription: Location.LocationSubscription | undefined;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access to navigate while walking.');
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          ({ coords }) => {
            if (stopped || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
            const position = { latitude: coords.latitude, longitude: coords.longitude };
            setNavigationPosition(position);
            if (coords.accuracy != null && coords.accuracy > 40) {
              setNavigationError('Waiting for a more accurate location fix.');
              return;
            }
            setNavigationError(null);
            const steps = walkingRoute?.steps;
            if (!steps?.length || Date.now() - lastStepAdvanceAt.current < 5000) return;
            setNavigationStepIndex((current) => {
              const target = steps[current]?.endLocation;
              if (!target || distanceBetweenCoordinates(position, target) > Math.max(18, coords.accuracy ?? 0)) {
                return current;
              }
              lastStepAdvanceAt.current = Date.now();
              return Math.min(current + 1, steps.length - 1);
            });
          },
        );
        if (stopped) subscription.remove();
      } catch (error) {
        if (stopped) return;
        setNavigationActive(false);
        setNavigationError(error instanceof Error ? error.message : 'Location updates are unavailable.');
      }
    })();
    return () => {
      stopped = true;
      subscription?.remove();
    };
  }, [navigationActive, routeMode, directionsVenue?.id, walkingRoute?.steps]);

  const changeRouteMode = (mode: 'walking' | 'transit') => {
    if (mode !== 'walking') stopNavigation();
    setRouteMode(mode);
    if (mode === 'transit' && !transitRoute) void refreshTransit();
  };
  const filteredVenues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return plannerActive ? plannerVenues : discoveryVenues.slice(0, 12);
    return mapVenues
      .filter((venue) =>
        [venue.name, venue.type, venue.category, venue.neighborhood, venue.fullAddress]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [discoveryVenues, mapVenues, plannerActive, plannerVenues, searchQuery]);

  const closeDirections = () => {
    stopNavigation();
    setFreshTransit(null);
    if (directionsReturn === 'back' && router.canGoBack()) {
      router.back();
      return;
    }
    setDirectionsVenue(null);
    clearRouteParams();
    setResultsRailVisible(true);
  };
  const clearRouteParams = () => {
    if (!directionsVenueId && !transitOriginName) return;
    router.setParams({
      directionsVenueId: '',
      directionsVenueData: '',
      directionsReturn: 'map',
      transitOriginName: '',
      transitDestinationName: '',
      transitOriginCoordinates: '',
      transitDestinationCoordinates: '',
      transitOriginPolyline: '',
      transitPolyline: '',
      transitDestinationPolyline: '',
      transitOriginWalkMinutes: '',
      transitOriginWalkDistance: '',
      transitDurationMinutes: '',
      transitDistanceMeters: '',
      transitSteps: '',
      transitWalkMinutes: '',
      transitWalkDistance: '',
      transitUpdatedAt: '',
    });
  };
  const backToPlanner = () => {
    const plannerHref = {
      pathname: '/' as const,
      params: {
        openPlanner: String(plannerMode || 'night'),
        plannerIds: String(plannerIds || ''),
        plannerVenues: String(plannerVenueData || ''),
        plannerLocation: String(plannerLocation || 'Current location'),
        plannerPrice: String(plannerPrice || '££'),
      },
    };
    if (router.canDismiss()) {
      router.dismissTo(plannerHref);
      return;
    }
    router.replace(plannerHref);
  };

  const selectVenue = (venue: Venue, clearSearch = false) => {
    stopNavigation();
    setFreshTransit(null);
    const nextIndex = mapVenues.findIndex((item) => item.id === venue.id);
    if (nextIndex < 0) return;
    setSelectedIndex(nextIndex);
    setDirectionsVenue(null);
    clearRouteParams();
    setSearchFocused(false);
    setResultsRailVisible(clearSearch);
    if (clearSearch) setSearchQuery('');
    Keyboard.dismiss();
    const railSource = clearSearch ? mapVenues.slice(0, 12) : filteredVenues;
    const railIndex = railSource.findIndex((item) => item.id === venue.id);
    if (railIndex >= 0) {
      const scrollToVenue = () =>
        railRef.current?.scrollTo({ x: railIndex * (CARD_WIDTH + RAIL_GAP), animated: true });
      if (clearSearch && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(scrollToVenue);
      } else {
        scrollToVenue();
      }
    }
  };

  const handleSearchSubmit = () => {
    if (filteredVenues[0]) selectVenue(filteredVenues[0], true);
  };

  const openDirections = (venue: Venue) => {
    stopNavigation();
    setFreshTransit(null);
    clearRouteParams();
    setSelectedIndex(Math.max(0, mapVenues.findIndex((item) => item.id === venue.id)));
    setDirectionsVenue(venue);
    setRouteMode('walking');
    setResultsRailVisible(false);
    setSearchFocused(false);
    Keyboard.dismiss();
  };

  useEffect(() => {
    if (directionsVenueId) {
      setRouteMode(transitOriginName && transitDestinationName ? 'transit' : 'walking');
    }
  }, [directionsVenueId, transitOriginName, transitDestinationName]);

  useEffect(() => {
    const requestedVenueId = String(directionsVenueId || '');
    if (!requestedVenueId) return;
    const requestedIndex = mapVenues.findIndex((venue) => venue.id === requestedVenueId);
    if (requestedIndex < 0) return;
    setSelectedIndex(requestedIndex);
    setDirectionsVenue(mapVenues[requestedIndex]);
    setResultsRailVisible(false);
    setSearchFocused(false);
    const timer = setTimeout(
      () => railRef.current?.scrollTo({ x: requestedIndex * (CARD_WIDTH + RAIL_GAP), animated: true }),
      80,
    );
    return () => clearTimeout(timer);
  }, [directionsVenueId, mapVenues]);

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.secondary }]}>
      <GoogleMapSurface
        authBackgroundColor={colors.background}
        venues={mapVenues}
        selectedVenue={selectedVenue}
        onSelectVenue={(venue) => selectVenue(venue, true)}
        routeVenues={plannerActive ? plannerVenues : directionsVenue ? [directionsVenue] : []}
        userCoordinates={navigationActive ? navigationPosition ?? coordinates : coordinates}
        followUser={navigationActive && navigationPosition !== null}
        routeSegments={routeSegments}
        stations={directionsVenue && routeMode === 'transit' ? stationCoordinates : null}
      />

      {Platform.OS === 'web' && !directionsVenue && !plannerActive ? (
      <View pointerEvents="box-none" style={styles.markerLayer}>
        {markerLayout.slice(0, mapVenues.length).map((marker, index) => {
          const markerVenue = mapVenues[index % mapVenues.length];
          return (
          <Pressable
            key={`${marker.left}-${marker.top}`}
            accessibilityLabel={`Select ${markerVenue.name} on map`}
            accessibilityRole="button"
            onPress={() => selectVenue(markerVenue)}
            style={[
              styles.mapMarker,
              { left: marker.left, top: marker.top },
              selectedIndex === index && styles.selectedMarker,
            ]}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: selectedIndex === index ? colors.green600 : colors.green800 },
              ]}
            >
              <Text style={[styles.pinText, { color: colors.primaryForeground }]}>
                {marker.price}
              </Text>
            </View>
          </Pressable>
          );
        })}
      </View>
      ) : null}

      {!directionsVenue && !plannerActive ? (
      <View style={[styles.searchShell, { top: Math.max(14, insets.top + 8) }]}>
        <View style={[styles.searchField, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={20} color={colors.green700} />
          <TextInput
            testID="map-search"
            accessibilityLabel="Search places on map"
            autoCapitalize="none"
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onSubmitEditing={handleSearchSubmit}
            placeholder="Search places, food or areas"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable
              accessibilityLabel="Clear map search"
              accessibilityRole="button"
              onPress={() => setSearchQuery('')}
              style={styles.clearSearch}
            >
              <Feather name="x-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        {searchFocused && searchQuery.trim() ? (
          <View style={[styles.searchResults, { backgroundColor: colors.card }]}>
            {filteredVenues.length ? (
              filteredVenues.slice(0, 5).map((venue) => (
                <Pressable
                  key={venue.id}
                  accessibilityLabel={`Select search result ${venue.name}`}
                  accessibilityRole="button"
                  onPress={() => selectVenue(venue, true)}
                  style={({ pressed }) => [styles.searchResult, pressed && styles.pressed]}
                >
                  <View style={[styles.searchResultIcon, { backgroundColor: colors.secondary }]}>
                    <Ionicons name="location-outline" size={17} color={colors.green700} />
                  </View>
                  <View style={styles.searchResultCopy}>
                    <Text numberOfLines={1} style={[styles.searchResultName, { color: colors.foreground }]}>
                      {venue.name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.searchResultMeta, { color: colors.mutedForeground }]}>
                      {venue.type} · {venue.neighborhood}
                    </Text>
                  </View>
                  <Feather name="arrow-up-right" size={16} color={colors.border} />
                </Pressable>
              ))
            ) : (
              <Text style={[styles.noResults, { color: colors.mutedForeground }]}>No nearby places found</Text>
            )}
          </View>
        ) : null}
      </View>
      ) : null}

      {plannerActive ? (
        <View
          style={[
            styles.plannerBanner,
            {
              backgroundColor: colors.green800,
              top: Math.max(16, insets.top + 10),
            },
          ]}
        >
          <View style={styles.plannerBannerCopy}>
            <Text style={[styles.plannerBannerEyebrow, { color: colors.honey }]}>PANDA ROUTE</Text>
            <Text style={[styles.plannerBannerTitle, { color: colors.primaryForeground }]}>
              {plannerMode === 'morning' ? 'Your morning' : plannerMode === 'lunch' ? 'Your lunch' : 'Your night'} · {plannerVenues.length} stops
            </Text>
            <View style={styles.plannerStopRow}>
              {plannerVenues.slice(0, 3).map((venue, index) => (
                <View key={venue.id} style={styles.plannerStop}>
                  <View style={[styles.plannerStopNumber, { backgroundColor: colors.honey }]}>
                    <Text style={[styles.plannerStopNumberText, { color: colors.honeyInk }]}>{index + 1}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.plannerStopName, { color: colors.primaryForeground }]}>
                    {venue.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable
            accessibilityLabel="Back to Planner"
            accessibilityRole="button"
            onPress={backToPlanner}
            style={[styles.backToPlanner, { backgroundColor: colors.honey }]}
          >
            <Feather name="arrow-left" size={15} color={colors.honeyInk} />
            <Text style={[styles.backToPlannerText, { color: colors.honeyInk }]}>Back to Planner</Text>
          </Pressable>
        </View>
      ) : null}

      {!directionsVenue && !plannerActive ? (
      <Pressable
        accessibilityLabel="Close map"
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.closeButton, { backgroundColor: colors.card, top: Math.max(14, insets.top + 8) }]}
      >
        <Feather name="x" size={21} color={colors.foreground} />
      </Pressable>
      ) : null}

      {directionsVenue ? (
        <PandaRouteSheet
          insetsBottom={insets.bottom}
          onClose={closeDirections}
          closeLabel={directionsReturn === 'back' ? 'Back to venue' : 'Close directions'}
          transitRoute={transitRoute}
          walkingRoute={walkingRoute}
          mode={routeMode}
          onModeChange={changeRouteMode}
          hasMappedRoute={hasMappedRoute}
          transitAvailable={directionsVenue.id.startsWith('ChIJ')}
          transitRefreshing={transitRefreshing}
          transitError={transitError}
          onRefreshTransit={() => void refreshTransit()}
          navigationActive={navigationActive}
          navigationStepIndex={navigationStepIndex}
          navigationError={navigationError}
          onStartNavigation={() => {
            if (!walkingRoute?.steps?.length || !hasMappedRoute || Platform.OS === 'web') {
              setNavigationError('Step-by-step walking directions are unavailable for this route.');
              return;
            }
            if (!coordinates) {
              setNavigationError('Allow location access to start walking navigation.');
              return;
            }
            setNavigationError(null);
            setNavigationOrigin(coordinates);
            setNavigationStepIndex(0);
            lastStepAdvanceAt.current = 0;
            setNavigationActive(true);
          }}
          onStopNavigation={stopNavigation}
          onReroute={() => {
            if (!navigationPosition) {
              setNavigationError('Waiting for your current location before updating the route.');
              return;
            }
            setNavigationStepIndex(0);
            setNavigationOrigin(navigationPosition);
            setNavigationError(null);
          }}
          onNavigationStepChange={setNavigationStepIndex}
          venue={directionsVenue}
        />
      ) : null}

      {!directionsVenue && (plannerActive || resultsRailVisible) && filteredVenues.length > 0 && selectedVenue ? (
      <View style={[styles.railShell, { bottom: 89 + insets.bottom }]}>
        <ScrollView
          ref={railRef}
          horizontal
          contentContainerStyle={styles.railContent}
          decelerationRate="fast"
          directionalLockEnabled
          disableIntervalMomentum
          nestedScrollEnabled
          onScroll={({ nativeEvent }) => {
            const railIndex = Math.round(nativeEvent.contentOffset.x / (CARD_WIDTH + RAIL_GAP));
            const visibleVenue = filteredVenues[railIndex];
            if (!visibleVenue) return;
            const venueIndex = mapVenues.findIndex((item) => item.id === visibleVenue.id);
            if (venueIndex >= 0 && venueIndex !== selectedIndex) setSelectedIndex(venueIndex);
          }}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + RAIL_GAP}
          snapToAlignment="start"
          onMomentumScrollEnd={({ nativeEvent }) => {
            const railIndex = Math.round(nativeEvent.contentOffset.x / (CARD_WIDTH + RAIL_GAP));
            if (filteredVenues[railIndex]) selectVenue(filteredVenues[railIndex]);
          }}
        >
          {filteredVenues.map((venue) => {
            const venueIndex = mapVenues.findIndex((item) => item.id === venue.id);
            const selected = venueIndex === selectedIndex;
            return (
              <View
                key={venue.id}
                style={[
                  styles.venueCard,
                  { backgroundColor: colors.card, borderColor: selected ? colors.green600 : colors.border },
                ]}
              >
                <View style={styles.venueImageFrame}>
                  <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={110} />
                </View>
                <View style={styles.venueCardCopy}>
                  <Text numberOfLines={1} style={[styles.venueCardName, { color: colors.foreground }]}>
                    {venue.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.venueCardMeta, { color: colors.mutedForeground }]}>
                    {venue.distance} · {venue.walkingTime} · {venue.price || '££'}
                  </Text>
                  <View style={styles.venueCardActions}>
                    <Pressable
                      accessibilityLabel={`Get directions to ${venue.name}`}
                      accessibilityRole="button"
                      onPress={() => openDirections(venue)}
                      style={[styles.cardDirectionsButton, { backgroundColor: colors.honey }]}
                    >
                      <Ionicons name="navigate-outline" size={14} color={colors.honeyInk} />
                      <Text style={[styles.cardDirectionsText, { color: colors.honeyInk }]}>Directions</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Open ${venue.name}`}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: '/venue/[id]',
                          params: {
                            id: venue.id,
                            venueData: JSON.stringify(venue),
                            ...(plannerContextAvailable
                              ? {
                                  fromPlanner: '1',
                                  plannerIds: String(plannerIds || ''),
                                  plannerVenues: String(plannerVenueData || ''),
                                  plannerMode: String(plannerMode || 'night'),
                                  plannerLocation: String(plannerLocation || 'Current location'),
                                  plannerPrice: String(plannerPrice || '££'),
                                }
                              : liveVenues.some((item) => item.id === venue.id)
                                ? {
                                    plannerVenues: JSON.stringify([venue]),
                                    plannerLocation: liveArea,
                                  }
                                : {}),
                          },
                        })
                      }
                      style={[styles.cardOpenButton, { backgroundColor: colors.green800 }]}
                    >
                      <Feather name="chevron-right" size={18} color={colors.primaryForeground} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityLabel="Previous venue"
          accessibilityRole="button"
          onPress={() => moveRail(-1, filteredVenues, selectedVenue, railRef, selectVenue)}
          style={[styles.railArrow, styles.railArrowLeft, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={20} color={colors.green800} />
        </Pressable>
        <Pressable
          accessibilityLabel="Next venue"
          accessibilityRole="button"
          onPress={() => moveRail(1, filteredVenues, selectedVenue, railRef, selectVenue)}
          style={[styles.railArrow, styles.railArrowRight, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-right" size={20} color={colors.green800} />
        </Pressable>
      </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function moveRail(
  direction: -1 | 1,
  railVenues: Venue[],
  selectedVenue: Venue,
  railRef: React.RefObject<ScrollView | null>,
  selectVenue: (venue: Venue) => void,
) {
  const currentIndex = Math.max(0, railVenues.findIndex((venue) => venue.id === selectedVenue.id));
  const nextIndex = Math.min(railVenues.length - 1, Math.max(0, currentIndex + direction));
  const nextVenue = railVenues[nextIndex];
  if (!nextVenue) return;
  railRef.current?.scrollTo({ x: nextIndex * (CARD_WIDTH + RAIL_GAP), animated: true });
  selectVenue(nextVenue);
}

const GoogleMapSurface = memo(function GoogleMapSurface({
  authBackgroundColor,
  venues,
  selectedVenue,
  onSelectVenue,
  routeVenues,
  userCoordinates,
  followUser,
  routeSegments,
  stations,
}: {
  authBackgroundColor: string;
  venues: Venue[];
  selectedVenue?: Venue;
  onSelectVenue: (venue: Venue) => void;
  routeVenues: Venue[];
  userCoordinates: { latitude: number; longitude: number } | null;
  followUser: boolean;
  routeSegments: { encoded: string; mode: 'walking' | 'transit' }[];
  stations: { origin: { name: string; coordinate: { latitude: number; longitude: number } }; destination: { name: string; coordinate: { latitude: number; longitude: number } } } | null;
}) {
  // A fixed embeddable map URL avoids Google's non-embeddable directions
  // pages and preserves the iframe while Panda's own overlays change.
  const mapQuery = `https://maps.google.com/maps?q=${GOOGLE_MAP_CENTER}&z=14&output=embed`;

  if (Platform.OS !== 'web') {
    return (
      <NativeGoogleMap
        backgroundColor={authBackgroundColor}
        venues={venues}
        selectedVenue={selectedVenue}
        onSelectVenue={onSelectVenue}
        routeVenues={routeVenues}
        userCoordinates={userCoordinates}
        followUser={followUser}
        routeSegments={routeSegments}
        stations={stations}
      />
    );
  }

  return createElement('div', {
    style: {
      bottom: 0,
      isolation: 'isolate',
      left: 0,
      overflow: 'hidden',
      pointerEvents: 'auto',
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: 0,
    },
  }, createElement('iframe', {
      key: 'panda-google-map',
      title: 'Panda venues on Google Maps',
      src: mapQuery,
      loading: 'eager',
      referrerPolicy: 'no-referrer-when-downgrade',
      style: {
        border: 0,
        display: 'block',
        height: '100%',
        width: '100%',
      },
    }));
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  markerLayer: { ...StyleSheet.absoluteFillObject },
  searchShell: { left: 16, position: 'absolute', right: 68, zIndex: 20 },
  searchField: {
    alignItems: 'center',
    borderRadius: 17,
    elevation: 7,
    flexDirection: 'row',
    height: 48,
    paddingHorizontal: 14,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, marginLeft: 9, paddingVertical: 0 },
  clearSearch: { padding: 3 },
  searchResults: {
    borderRadius: 17,
    elevation: 8,
    marginTop: 7,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 6,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
  },
  searchResult: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', minHeight: 52, paddingHorizontal: 7 },
  searchResultIcon: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  searchResultCopy: { flex: 1, marginLeft: 9 },
  searchResultName: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  searchResultMeta: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
  noResults: { fontFamily: 'Inter_500Medium', fontSize: 13, padding: 14 },
  plannerBanner: {
    alignItems: 'center',
    borderRadius: 18,
    elevation: 7,
    flexDirection: 'row',
    left: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    zIndex: 18,
  },
  plannerBannerCopy: { flex: 1 },
  plannerBannerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.2 },
  plannerBannerTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 2 },
  plannerStopRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
  plannerStop: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 5, minWidth: 0 },
  plannerStopNumber: { alignItems: 'center', borderRadius: 999, height: 20, justifyContent: 'center', width: 20 },
  plannerStopNumberText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  plannerStopName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 9 },
  backToPlanner: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 9 },
  backToPlannerText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  mapMarker: { position: 'absolute', transform: [{ translateX: -19 }, { translateY: -32 }] },
  selectedMarker: { zIndex: 8 },
  pin: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomLeftRadius: 5,
    borderWidth: 2,
    elevation: 5,
    height: 38,
    justifyContent: 'center',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 6,
    transform: [{ rotate: '45deg' }],
    width: 38,
  },
  pinText: { fontFamily: 'Inter_700Bold', fontSize: 10, transform: [{ rotate: '-45deg' }] },
  closeButton: {
    alignItems: 'center',
    borderRadius: 999,
    elevation: 5,
    height: 43,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    width: 43,
    zIndex: 21,
  },
  railShell: { position: 'absolute', left: 0, right: 0, zIndex: 15 },
  railContent: { gap: RAIL_GAP, paddingHorizontal: 16 },
  venueCard: {
    borderRadius: 21,
    borderWidth: 2,
    elevation: 9,
    flexDirection: 'row',
    height: 126,
    overflow: 'hidden',
    padding: 7,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    width: CARD_WIDTH,
  },
  venueImageFrame: { borderRadius: 15, height: 110, overflow: 'hidden', width: 92 },
  venueCardCopy: { flex: 1, justifyContent: 'space-between', marginLeft: 11, minWidth: 0, paddingVertical: 4 },
  venueCardName: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  venueCardMeta: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 },
  venueCardActions: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  cardDirectionsButton: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
  cardDirectionsText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  cardOpenButton: { alignItems: 'center', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  railArrow: {
    alignItems: 'center',
    borderRadius: 999,
    elevation: 6,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
    top: 45,
    width: 36,
  },
  railArrowLeft: { left: 2 },
  railArrowRight: { right: 2 },
  pressed: { opacity: 0.7 },
});