import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, memo, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Linking,
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
import { WebView } from 'react-native-webview';
import Svg, { Polyline } from 'react-native-svg';
import { VenuePhoto } from '@/components/VenuePhoto';
import { venues, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

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
    return parsed.slice(0, 16).flatMap((step) => {
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

function formatRouteDistance(value: string | number) {
  const metres = Number(value);
  if (!Number.isFinite(metres) || metres < 0) return null;
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

export default function MapScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    directionsVenueId,
    plannerIds,
    plannerVenues: plannerVenueData,
    plannerLocation,
    plannerMode,
    plannerPrice,
    transitOriginName,
    transitDestinationName,
    transitOriginWalkMinutes,
    transitOriginWalkDistance,
    transitDurationMinutes,
    transitDistanceMeters,
    transitSteps,
    transitWalkMinutes,
    transitWalkDistance,
  } = useLocalSearchParams<{
    directionsVenueId?: string;
    plannerIds?: string;
    plannerVenues?: string;
    plannerLocation?: string;
    plannerMode?: string;
    plannerPrice?: string;
    transitOriginName?: string;
    transitDestinationName?: string;
    transitOriginWalkMinutes?: string;
    transitOriginWalkDistance?: string;
    transitDurationMinutes?: string;
    transitDistanceMeters?: string;
    transitSteps?: string;
    transitWalkMinutes?: string;
    transitWalkDistance?: string;
  }>();
  const insets = useSafeAreaInsets();
  const railRef = useRef<ScrollView>(null);
  const dynamicPlannerVenues = useMemo(
    () => parsePlannerVenueData(String(plannerVenueData || '')),
    [plannerVenueData],
  );
  const plannerVenues = useMemo(() => {
    if (dynamicPlannerVenues.length) return dynamicPlannerVenues;
    const ids = String(plannerIds || '')
      .split(',')
      .filter(Boolean);
    return ids.map((id) => venues.find((venue) => venue.id === id)).filter((venue): venue is Venue => Boolean(venue));
  }, [dynamicPlannerVenues, plannerIds]);
  const plannerActive = plannerVenues.length > 0;
  const mapVenues = plannerActive ? plannerVenues : venues;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstId = String(plannerIds || '').split(',')[0];
    const requestedVenueId = String(directionsVenueId || firstId);
    return Math.max(0, mapVenues.findIndex((venue) => venue.id === requestedVenueId));
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [directionsVenue, setDirectionsVenue] = useState<Venue | null>(() =>
    mapVenues.find((venue) => venue.id === String(directionsVenueId || '')) ?? null,
  );
  const selectedVenue = mapVenues[selectedIndex % mapVenues.length];
  const parsedTransitSteps = useMemo(
    () => parseTransitSteps(String(transitSteps || '')),
    [transitSteps],
  );
  const transitRoute: TransitRouteContext | null =
    transitOriginName && transitDestinationName
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
        }
      : null;
  const filteredVenues = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return plannerActive ? plannerVenues : venues.slice(0, 12);
    return mapVenues
      .filter((venue) =>
        [venue.name, venue.type, venue.category, venue.neighborhood, venue.fullAddress]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [mapVenues, plannerActive, plannerVenues, searchQuery]);

  const selectVenue = (venue: Venue, clearSearch = false) => {
    const nextIndex = mapVenues.findIndex((item) => item.id === venue.id);
    if (nextIndex < 0) return;
    setSelectedIndex(nextIndex);
    setDirectionsVenue(null);
    setSearchFocused(false);
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
    setSelectedIndex(Math.max(0, mapVenues.findIndex((item) => item.id === venue.id)));
    setDirectionsVenue(venue);
    setSearchFocused(false);
    Keyboard.dismiss();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: colors.secondary }]}>
      <GoogleMapSurface />

      {plannerActive ? (
        <Svg pointerEvents="none" style={styles.routeOverlay} viewBox="0 0 100 100">
          <Polyline
            fill="none"
            points="15,27 42,39 73,18"
            stroke={colors.green700}
            strokeDasharray="3 2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </Svg>
      ) : null}

      <View pointerEvents="box-none" style={styles.markerLayer}>
        {(plannerActive ? markerLayout.slice(0, plannerVenues.length) : markerLayout).map((marker, index) => {
          const markerVenue = plannerActive ? plannerVenues[index] : venues[index % venues.length];
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
                {plannerActive ? String(index + 1) : marker.price}
              </Text>
            </View>
          </Pressable>
          );
        })}
      </View>

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

      {plannerActive ? (
        <View
          style={[
            styles.plannerBanner,
            {
              backgroundColor: colors.green800,
              top: directionsVenue ? Math.max(204, insets.top + 196) : Math.max(74, insets.top + 68),
            },
          ]}
        >
          <View style={styles.plannerBannerCopy}>
            <Text style={[styles.plannerBannerEyebrow, { color: colors.honey }]}>PANDA ROUTE</Text>
            <Text style={[styles.plannerBannerTitle, { color: colors.primaryForeground }]}>
              {plannerMode === 'morning' ? 'Your morning' : plannerMode === 'lunch' ? 'Your lunch' : 'Your night'} · {plannerVenues.length} stops
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Back to Planner"
            accessibilityRole="button"
            onPress={() =>
              router.replace({
                pathname: '/',
                params: {
                  openPlanner: String(plannerMode || 'night'),
                  plannerIds: String(plannerIds || ''),
                   plannerVenues: String(plannerVenueData || ''),
                  plannerLocation: String(plannerLocation || 'Current location'),
                  plannerPrice: String(plannerPrice || '££'),
                },
              })
            }
            style={[styles.backToPlanner, { backgroundColor: colors.honey }]}
          >
            <Feather name="arrow-left" size={15} color={colors.honeyInk} />
            <Text style={[styles.backToPlannerText, { color: colors.honeyInk }]}>Back to Planner</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel="Close map"
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.closeButton, { backgroundColor: colors.card, top: Math.max(14, insets.top + 8) }]}
      >
        <Feather name="x" size={21} color={colors.foreground} />
      </Pressable>

      {directionsVenue ? (
        <DirectionsPanel
          colors={colors}
          insetsTop={insets.top}
          onClose={() => setDirectionsVenue(null)}
          transitRoute={transitRoute}
          venue={directionsVenue}
        />
      ) : null}

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
                  <VenuePhoto venueId={venue.id} venueName={venue.name} height={110} />
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
                            ...(plannerActive
                              ? {
                                  fromPlanner: '1',
                                  plannerIds: String(plannerIds || ''),
                                  plannerVenues: String(plannerVenueData || ''),
                                  plannerMode: String(plannerMode || 'night'),
                                  plannerLocation: String(plannerLocation || 'Current location'),
                                  plannerPrice: String(plannerPrice || '££'),
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

const GoogleMapSurface = memo(function GoogleMapSurface() {
  const colors = useColors();
  const mapQuery = `https://www.google.com/maps?q=${GOOGLE_MAP_CENTER}&z=14&output=embed`;

  if (Platform.OS !== 'web') {
    return (
      <WebView
        source={{ uri: mapQuery }}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return createElement('iframe', {
    key: 'panda-google-map',
    title: 'Panda venues on Google Maps',
    src: mapQuery,
    loading: 'eager',
    referrerPolicy: 'no-referrer-when-downgrade',
    style: {
      border: 0,
      display: 'block',
      height: '100%',
      left: 0,
      position: 'absolute',
      top: 0,
      width: '100%',
    },
  });
});

function DirectionsPanel({
  colors,
  insetsTop,
  onClose,
  transitRoute,
  venue,
}: {
  colors: ReturnType<typeof useColors>;
  insetsTop: number;
  onClose: () => void;
  transitRoute: {
    originName: string;
    destinationName: string;
    originWalkMinutes: string;
    originWalkDistance: string;
    durationMinutes: string;
    distanceMeters: string;
    steps: TransitStep[];
    walkMinutes: string;
    walkDistance: string;
  } | null;
  venue: Venue;
}) {
  return (
    <View style={[styles.directionsPanel, { backgroundColor: colors.card, top: Math.max(72, insetsTop + 66) }]}>
      <View style={styles.directionsPanelHeader}>
        <View style={[styles.routeIcon, { backgroundColor: colors.green700 }]}>
          <Ionicons name="navigate" size={17} color={colors.primaryForeground} />
        </View>
        <View style={styles.directionsPanelCopy}>
          <Text style={[styles.directionsPanelTitle, { color: colors.foreground }]}>
            {transitRoute ? 'Transit route' : 'Walking route'}
          </Text>
          <Text numberOfLines={1} style={[styles.directionsPanelVenue, { color: colors.mutedForeground }]}>
            To {venue.name}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close directions"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.panelClose, { backgroundColor: colors.secondary }]}
        >
          <Feather name="x" size={17} color={colors.foreground} />
        </Pressable>
      </View>
      {transitRoute ? (
        <>
          <View style={[styles.transitRoutePoints, { borderTopColor: colors.border }]}>
            <View style={styles.transitRoutePoint}>
              <View style={[styles.transitRouteDot, { backgroundColor: colors.green700 }]} />
              <View style={styles.transitRoutePointCopy}>
                <Text style={[styles.transitRouteLabel, { color: colors.mutedForeground }]}>
                  YOUR NEAREST STATION
                </Text>
                <Text style={[styles.transitRouteName, { color: colors.foreground }]}>{transitRoute.originName}</Text>
              </View>
            </View>
            <View style={[styles.transitRouteLine, { backgroundColor: colors.goldLine }]} />
            <View style={styles.transitRoutePoint}>
              <View style={[styles.transitRouteDot, { backgroundColor: colors.gold }]} />
              <View style={styles.transitRoutePointCopy}>
                <Text style={[styles.transitRouteLabel, { color: colors.mutedForeground }]}>
                  VENUE’S NEAREST STATION
                </Text>
                <Text style={[styles.transitRouteName, { color: colors.foreground }]}>
                  {transitRoute.destinationName}
                </Text>
              </View>
            </View>
          </View>
          {transitRoute.durationMinutes ? (
            <View style={[styles.transitOverview, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Ionicons name="train-outline" size={17} color={colors.green700} />
              <View style={styles.transitOverviewCopy}>
                <Text style={[styles.transitOverviewLabel, { color: colors.mutedForeground }]}>
                  LIVE PUBLIC TRANSPORT
                </Text>
                <Text style={[styles.transitOverviewValue, { color: colors.foreground }]}>
                  {transitRoute.durationMinutes} min between stations
                  {formatRouteDistance(transitRoute.distanceMeters)
                    ? ` · ${formatRouteDistance(transitRoute.distanceMeters)}`
                    : ''}
                </Text>
              </View>
            </View>
          ) : null}
          {transitRoute.originWalkMinutes ? (
            <View style={[styles.routeSummary, { borderTopColor: colors.border }]}>
              <Ionicons name="walk-outline" size={17} color={colors.green700} />
              <Text style={[styles.routeSummaryText, { color: colors.foreground }]}>
                Walk {transitRoute.originWalkMinutes} min to {transitRoute.originName}
                {formatRouteDistance(transitRoute.originWalkDistance)
                  ? ` · ${formatRouteDistance(transitRoute.originWalkDistance)}`
                  : ''}
              </Text>
            </View>
          ) : null}
          {transitRoute.steps.length ? (
            <>
              <Text style={[styles.transitStepsTitle, { color: colors.green700 }]}>STEP-BY-STEP</Text>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.transitSteps}
              >
                {transitRoute.steps.map((step, index) => (
                  <View
                    key={`${step.mode}-${step.instruction}-${index}`}
                    style={[styles.transitStep, { borderColor: colors.border }]}
                  >
                    <View style={[styles.transitStepNumber, { backgroundColor: colors.green700 }]}>
                      <Text style={[styles.transitStepNumberText, { color: colors.primaryForeground }]}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={styles.transitStepCopy}>
                      <Text style={[styles.transitStepMode, { color: colors.green700 }]}>
                        {step.mode === 'TRANSIT' ? step.lineName || 'PUBLIC TRANSPORT' : 'WALK'}
                      </Text>
                      <Text style={[styles.transitStepInstruction, { color: colors.foreground }]}>
                        {step.instruction}
                      </Text>
                      <Text style={[styles.transitStepMeta, { color: colors.mutedForeground }]}>
                        {step.durationMinutes} min
                        {formatRouteDistance(step.distanceMeters)
                          ? ` · ${formatRouteDistance(step.distanceMeters)}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          <View style={[styles.routeSummary, { borderTopColor: colors.border }]}>
            <Ionicons name="walk-outline" size={17} color={colors.goldDeep} />
            <Text style={[styles.routeSummaryText, { color: colors.foreground }]}>
              {transitRoute.walkMinutes
                ? `${transitRoute.walkMinutes} min walk from the station · ${
                    Number(transitRoute.walkDistance) < 1000
                      ? `${Math.round(Number(transitRoute.walkDistance))} m`
                      : `${(Number(transitRoute.walkDistance) / 1000).toFixed(1)} km`
                  }`
                : 'Walk from the destination station to the venue'}
            </Text>
          </View>
        </>
      ) : (
        <View style={[styles.routeSummary, { borderTopColor: colors.border }]}>
          <Ionicons name="walk-outline" size={17} color={colors.green700} />
          <Text style={[styles.routeSummaryText, { color: colors.foreground }]}>
            {venue.walkingTime} · {venue.distance} from your location
          </Text>
        </View>
      )}
      <Text style={[styles.routeHint, { color: colors.mutedForeground }]}>
        {transitRoute
          ? transitRoute.steps.length
            ? 'Live route details come from Google Routes and stay inside Panda.'
            : 'Live station context is shown while detailed Google transit steps are unavailable.'
          : 'Google Maps stays visible while you check this route.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  markerLayer: { ...StyleSheet.absoluteFillObject },
  routeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 4 },
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
  directionsPanel: {
    borderRadius: 20,
    elevation: 8,
    left: 16,
    maxHeight: '68%',
    padding: 13,
    position: 'absolute',
    right: 16,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    zIndex: 19,
  },
  directionsPanelHeader: { alignItems: 'center', flexDirection: 'row' },
  routeIcon: { alignItems: 'center', borderRadius: 11, height: 37, justifyContent: 'center', width: 37 },
  directionsPanelCopy: { flex: 1, marginLeft: 10 },
  directionsPanelTitle: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  directionsPanelVenue: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  panelClose: { alignItems: 'center', borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  routeSummary: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10 },
  routeSummaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  routeHint: { fontFamily: 'Inter_500Medium', fontSize: 11, marginLeft: 25, marginTop: 4 },
  transitOverview: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 11,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  transitOverviewCopy: { flex: 1 },
  transitOverviewLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.7 },
  transitOverviewValue: { fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 2 },
  transitStepsTitle: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1, marginTop: 12 },
  transitSteps: { marginTop: 7, maxHeight: 190 },
  transitStep: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingBottom: 9,
    paddingTop: 2,
  },
  transitStepNumber: {
    alignItems: 'center',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  transitStepNumberText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  transitStepCopy: { flex: 1 },
  transitStepMode: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.6 },
  transitStepInstruction: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 15, marginTop: 2 },
  transitStepMeta: { fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 3 },
  transitRoutePoints: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  transitRoutePoint: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  transitRouteDot: { borderRadius: 999, height: 10, width: 10 },
  transitRoutePointCopy: { flex: 1 },
  transitRouteLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.7 },
  transitRouteName: { fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 2 },
  transitRouteLine: { height: 12, marginLeft: 4, marginVertical: 2, width: 2 },
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