import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Animated,
  PanResponder,
} from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaIcon, type PandaIconName } from '@/components/PandaIcon';
import { VenuePhoto, venuePhotosFor, type VenuePhotoItem } from '@/components/VenuePhoto';
import { PANDA_RUNTIME_API } from '@/constants/services';
import { getVenue, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

type GoogleVenueProfile = {
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  address: string;
  primaryType: string;
  editorialSummary: string | null;
  highlights: Array<{
    id: string;
    label: string;
  }>;
  latitude: number | null;
  longitude: number | null;
  source: 'google_places';
};

type TransitStation = {
  id: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  source: 'google_places';
};

type TransitWalk = {
  distanceMeters: number;
  durationMinutes: number;
  source: 'google_routes';
};

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

type TransitContext = {
  originStation: TransitStation;
  destinationStation: TransitStation;
  originWalk: TransitWalk | null;
  transitRoute: {
    durationMinutes: number;
    distanceMeters: number;
    steps: TransitStep[];
    source: 'google_routes';
  } | null;
  venueWalk: {
    distanceMeters: number;
    durationMinutes: number;
    source: 'google_routes';
  } | null;
  source: 'google_places';
};

type TransitStatus = 'idle' | 'loading' | 'ready' | 'permission-denied' | 'unavailable';

const GOOGLE_HIGHLIGHT_ICONS: Record<string, PandaIconName> = {
  'live-music': 'smile',
  'outdoor-seating': 'globe',
  cocktails: 'globe',
  beer: 'globe',
  wine: 'globe',
  reservations: 'calendar',
  groups: 'smile',
  children: 'smile',
  dogs: 'smile',
  vegetarian: 'award',
  breakfast: 'award',
  brunch: 'award',
  coffee: 'globe',
  delivery: 'navigate',
  takeaway: 'navigate',
  'dine-in': 'award',
};

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

export default function VenueDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, fromPlanner, plannerIds, plannerVenues: plannerVenueData, plannerMode, plannerLocation, plannerPrice } = useLocalSearchParams<{
    id: string;
    fromPlanner?: string;
    plannerIds?: string;
    plannerVenues?: string;
    plannerMode?: string;
    plannerLocation?: string;
    plannerPrice?: string;
  }>();
  const dynamicPlannerVenues = useMemo(
    () => parsePlannerVenueData(String(plannerVenueData || '')),
    [plannerVenueData],
  );
  const venue = getVenue(id ?? '') ?? dynamicPlannerVenues.find((item) => item.id === id);
  const plannerOpen = fromPlanner === '1' && Boolean(plannerIds);
  
  // Up to 5 photos as requested
  const allPhotos = venuePhotosFor(venue?.id ?? '');
  const photos = allPhotos.slice(0, 5);

  const [heroActive, setHeroActive] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryActive, setGalleryActive] = useState(0);
  const [googleProfile, setGoogleProfile] = useState<GoogleVenueProfile | null>(null);
  const [transitContext, setTransitContext] = useState<TransitContext | null>(null);
  const [transitStatus, setTransitStatus] = useState<TransitStatus>('idle');
  const [transitRetryKey, setTransitRetryKey] = useState(0);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const detailScrollRef = useRef<ScrollView>(null);
  const { width, height } = useWindowDimensions();
  const screenBottomInset =
    Platform.OS === 'web' ? 0 : Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 0);
  const venueSurface = '#FFFBF1';
  const detailsCanScroll =
    scrollViewportHeight > 0 && scrollContentHeight > scrollViewportHeight + 2;

  useEffect(() => {
    if (scrollViewportHeight > 0 && scrollContentHeight > 0 && !detailsCanScroll) {
      detailScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [detailsCanScroll, scrollContentHeight, scrollViewportHeight]);

  useEffect(() => {
    const placeId = venue?.id;
    if (!placeId || !placeId.startsWith('ChIJ')) {
      setGoogleProfile(null);
      return;
    }

    const controller = new AbortController();
    setGoogleProfile(null);
    fetch(`${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/profile`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Google venue profile unavailable');
        return response.json() as Promise<GoogleVenueProfile>;
      })
      .then((profile) => setGoogleProfile(profile))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setGoogleProfile(null);
      });

    return () => controller.abort();
  }, [venue?.id]);

  useEffect(() => {
    const placeId = venue?.id;
    if (!placeId?.startsWith('ChIJ')) {
      setTransitContext(null);
      setTransitStatus('unavailable');
      return;
    }

    let active = true;
    const controller = new AbortController();
    setTransitContext(null);
    setTransitStatus('loading');

    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (permission.status !== 'granted') {
          setTransitStatus('permission-denied');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;
        const response = await fetch(
          `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/transit?latitude=${encodeURIComponent(position.coords.latitude)}&longitude=${encodeURIComponent(position.coords.longitude)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Live transit information unavailable');
        const context = (await response.json()) as TransitContext;
        if (!active) return;
        setTransitContext(context);
        setTransitStatus('ready');
      } catch (error) {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return;
        setTransitContext(null);
        setTransitStatus('unavailable');
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [transitRetryKey, venue?.id]);

  if (!venue) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Venue unavailable</Text>
        <Pressable onPress={() => router.back()} style={[styles.primaryAction, { backgroundColor: colors.green800 }]}>
          <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const displayedRating =
    googleProfile?.rating != null ? googleProfile.rating.toFixed(1) : venue.rating;
  const displayedRatingCount = googleProfile?.ratingCount ?? venue.ratingCount;
  const displayedType = googleProfile?.primaryType || venue.type;
  const displayedOpenNow = googleProfile?.openNow ?? venue.openNow;
  const displayedAddress = googleProfile?.address || venue.fullAddress;

  const retryTransit = () => setTransitRetryKey((current) => current + 1);
  const openTransitRoute = () => {
    if (!transitContext) return;
    router.push({
      pathname: '/map',
      params: {
        directionsVenueId: venue.id,
        transitOriginName: transitContext.originStation.name,
        transitDestinationName: transitContext.destinationStation.name,
        transitOriginWalkMinutes: transitContext.originWalk?.durationMinutes.toString() ?? '',
        transitOriginWalkDistance: transitContext.originWalk?.distanceMeters.toString() ?? '',
        transitDurationMinutes: transitContext.transitRoute?.durationMinutes.toString() ?? '',
        transitDistanceMeters: transitContext.transitRoute?.distanceMeters.toString() ?? '',
        transitSteps: transitContext.transitRoute?.steps.length
          ? JSON.stringify(transitContext.transitRoute.steps)
          : '',
        transitWalkMinutes: transitContext.venueWalk?.durationMinutes.toString() ?? '',
        transitWalkDistance: transitContext.venueWalk?.distanceMeters.toString() ?? '',
        ...(plannerOpen
          ? {
              plannerIds: plannerIds || '',
               plannerVenues: String(plannerVenueData || ''),
              plannerMode: plannerMode || 'night',
              plannerPrice: plannerPrice || '££',
              plannerLocation: plannerLocation || 'Current location',
            }
          : {}),
      },
    });
  };

  const openGallery = () => {
    setGalleryActive(heroActive);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setHeroActive(galleryActive);
    setGalleryOpen(false);
  };

  const closeVenue = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  // Keep the hero editorial but compact enough that the venue essentials and
  // primary actions can share the first mobile frame.
  const heroHeight = Math.min(430, Math.max(290, height * 0.34));

  const backToPlanner = () => {
    router.replace({
      pathname: '/',
      params: {
        openPlanner: plannerMode || 'night',
        plannerIds: plannerIds || '',
        plannerVenues: String(plannerVenueData || ''),
        plannerLocation: plannerLocation || 'Current location',
        plannerPrice: plannerPrice || '££',
      },
    });
  };

  if (plannerOpen) {
    const plannerBackgroundVenues = dynamicPlannerVenues.length
      ? dynamicPlannerVenues
      : String(plannerIds || '')
        .split(',')
        .map((plannerId) => getVenue(plannerId))
        .filter((plannerVenue): plannerVenue is Venue => Boolean(plannerVenue));

    return (
      <PlannerVenuePreview
        colors={colors}
        insets={insets}
        onBack={backToPlanner}
        onDirections={() => router.push(`/venue/${venue.id}/directions`)}
        onMenu={() => router.push(`/venue/${venue.id}/menu`)}
        onReservation={() => router.push(`/venue/${venue.id}/reservation`)}
        plannerMode={plannerMode || 'night'}
        plannerVenues={plannerBackgroundVenues}
        photos={photos}
        venue={venue}
        width={width}
        displayedAddress={displayedAddress}
        displayedOpenNow={displayedOpenNow}
        displayedRating={displayedRating}
        displayedRatingCount={displayedRatingCount}
        displayedType={displayedType}
        transitContext={transitContext}
        onOpenTransitRoute={openTransitRoute}
        onRetryTransit={retryTransit}
        transitStatus={transitStatus}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.ivory, paddingBottom: screenBottomInset }]}>
      {/* Fixed hero area: only the venue information panel below it scrolls. */}
      <View style={{ height: heroHeight, backgroundColor: colors.green800 }}>
        {photos.length > 0 ? (
          <>
            <UniversalSwiper
              photos={photos}
              activeIndex={heroActive}
              width={width}
              height={heroHeight}
              onIndexChange={setHeroActive}
              onPhotoTap={openGallery}
            />
            <View style={[styles.heroOverlay, { justifyContent: 'flex-end' }]}>
              {photos.length > 1 && (
                <View style={styles.pagination}>
                  {photos.map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: idx === heroActive ? '#FFF' : 'rgba(255,255,255,0.4)',
                          width: idx === heroActive ? 18 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: colors.green700, width, height: heroHeight }]}>
            <Text style={[styles.heroFallbackText, { color: colors.primaryForeground }]}>
              {venue.name.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.detailsPanel,
          {
            backgroundColor: venueSurface,
          },
        ]}
      >
        {/* This header stays pinned while the detail content scrolls behind it. */}
        <View
          style={[
            styles.pinnedHeader,
            {
              backgroundColor: venueSurface,
              shadowColor: colors.green950,
            },
          ]}
        >
          <View style={styles.gripContainer}>
            <View style={[styles.grip, { backgroundColor: colors.border }]} />
          </View>

          {venue.premium && (
            <View
              style={[
                styles.premiumLabel,
                {
                  backgroundColor: colors.honeySoft,
                  borderColor: colors.honey,
                  shadowColor: colors.goldDeep,
                },
              ]}
            >
              <PandaIcon name="award" size={13} color={colors.goldDeep} />
              <Text style={[styles.premiumLabelText, { color: colors.honeyInk }]}>PANDA PREMIUM</Text>
            </View>
          )}

          <View style={styles.venueTitleRow}>
            <Text style={[styles.title, styles.venueTitle, { color: colors.foreground }]}>{venue.name}</Text>
            <PandaRatingBadge colors={colors} rating={displayedRating} />
          </View>

          <View style={styles.chips}>
            <MetaChip
              icon="star"
              label={`${displayedRating} (${displayedRatingCount})`}
              background={colors.goldSoft}
              foreground={colors.honeyInk}
            />
            {venue.price ? (
              <MetaChip label={venue.price} background={colors.muted} foreground={colors.green800} />
            ) : null}
            <MetaChip label={displayedType} background={colors.muted} foreground={colors.green800} />
            <MetaChip
              icon="clock"
              label={displayedOpenNow ? 'Open now' : 'Closed'}
              background={displayedOpenNow ? colors.openBackground : colors.closedBackground}
              foreground={displayedOpenNow ? colors.openForeground : colors.closedForeground}
            />
            <MetaChip
              icon="map"
              label={`${venue.distance} · ${venue.walkingTime}`}
              background={colors.muted}
              foreground={colors.green800}
            />
          </View>
        </View>

        <ScrollView
          ref={detailScrollRef}
          contentContainerStyle={{ backgroundColor: venueSurface }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          directionalLockEnabled
          overScrollMode="never"
          scrollEnabled={detailsCanScroll}
          onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, contentHeight) => setScrollContentHeight(contentHeight)}
          style={styles.detailsScroll}
        >
          <View
            style={[
              styles.detailsContent,
              {
                backgroundColor: venueSurface,
              },
            ]}
          >
            <View
              style={[
                styles.contextPanel,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  shadowColor: colors.green950,
                },
              ]}
            >
              {venue.description ? (
                <Text style={[styles.description, { color: colors.mutedForeground }]}>{venue.description}</Text>
              ) : null}

              <View style={styles.addressRow}>
                <View style={[styles.addressIcon, { backgroundColor: colors.mint100 }]}>
                  <PandaIcon name="map-pin" size={18} color={colors.green700} />
                </View>
                <View style={styles.addressTextContainer}>
                  <Text style={[styles.address, { color: colors.foreground }]}>{displayedAddress}</Text>
                </View>
              </View>
            </View>

            <ConciergeTransitCard
              colors={colors}
              context={transitContext}
              onOpenRoute={openTransitRoute}
              onRetry={retryTransit}
              status={transitStatus}
            />

            <View style={styles.conciergeStack}>
              {googleProfile?.highlights.length ? (
                <View style={styles.vibeSection}>
                  <View style={styles.vibeSectionHeading}>
                    <Text style={[styles.vibeSectionTitle, { color: colors.green800 }]}>Google venue details</Text>
                    <Text style={[styles.vibeSectionSource, { color: colors.mutedForeground }]}>Verified source</Text>
                  </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.vibeRow}
                >
                  {googleProfile.highlights.map((highlight) => (
                      <View
                        key={highlight.id}
                        accessibilityLabel={`${highlight.label}, provided by Google Places`}
                        style={[
                          styles.vibeChip,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <PandaIcon
                          name={GOOGLE_HIGHLIGHT_ICONS[highlight.id] ?? 'award'}
                          size={13}
                          color={colors.green800}
                        />
                        <Text style={[styles.vibeChipText, { color: colors.green800 }]}>
                          {highlight.label}
                        </Text>
                      </View>
                    ))}
                </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={styles.actions}>
            <ActionButton
              label="View menu"
              icon="globe"
              full
              background={colors.honey}
              foreground={colors.honeyInk}
              onPress={() => router.push(`/venue/${venue.id}/menu`)}
            />
            <ActionButton
              label="Reservations"
              icon="calendar"
              full
              background={colors.goldSoft}
              foreground={colors.honeyInk}
              onPress={() => router.push(`/venue/${venue.id}/reservation`)}
            />
            <ActionButton
              label="Directions"
                icon="navigate"
              background={colors.green700}
              foreground={colors.primaryForeground}
              onPress={() => router.push(`/venue/${venue.id}/directions`)}
            />
            {venue.phone ? (
              <ActionButton
                label="Call"
                icon="phone"
                background={colors.muted}
                foreground={colors.green800}
                onPress={() => openExternal(`tel:${venue.phone.replace(/\\s/g, '')}`)}
              />
            ) : null}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Fixed close control stays available while the details panel scrolls. */}
      <BoutiqueCloseButton
        accessibilityLabel="Close venue details"
        onPress={closeVenue}
        colors={colors}
        testID="venue-close"
        containerStyle={[styles.floatingClose, { top: Math.max(16, insets.top + 8) }]}
      />

      {/* Full Screen Gallery */}
      <PhotoGallery
        venue={venue}
        photos={photos}
        visible={galleryOpen}
        active={galleryActive}
        width={width}
        insets={insets}
        onActiveChange={setGalleryActive}
        onClose={closeGallery}
      />
    </View>
  );
}

function PlannerVenuePreview({
  colors,
  displayedAddress,
  displayedOpenNow,
  displayedRating,
  displayedRatingCount,
  displayedType,
  transitContext,
  onOpenTransitRoute,
  onRetryTransit,
  transitStatus,
  insets,
  onBack,
  onDirections,
  onMenu,
  onReservation,
  plannerMode,
  plannerVenues,
  photos,
  venue,
  width,
}: {
  colors: ReturnType<typeof useColors>;
  displayedAddress: string;
  displayedOpenNow: boolean;
  displayedRating: string;
  displayedRatingCount: number;
  displayedType: string;
  transitContext: TransitContext | null;
  onOpenTransitRoute: () => void;
  onRetryTransit: () => void;
  transitStatus: TransitStatus;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onBack: () => void;
  onDirections: () => void;
  onMenu: () => void;
  onReservation: () => void;
  plannerMode: string;
  plannerVenues: Venue[];
  photos: VenuePhotoItem[];
  venue: Venue;
  width: number;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const previewWidth = Math.max(280, width * 0.94);

  return (
    <View style={[styles.plannerPreviewScreen, { backgroundColor: colors.mint100 }]}>
      <View style={styles.plannerBackdrop}>
        <View pointerEvents="none" style={styles.plannerBackdropContent}>
          <View style={styles.plannerBackdropHeader}>
            <View>
              <Text style={[styles.plannerBackdropTitle, { color: colors.foreground }]}>Plan my {plannerMode}</Text>
              <Text style={[styles.plannerBackdropSubtitle, { color: colors.mutedForeground }]}>
                Tap a stop · re-roll with Panda Shuffle
              </Text>
            </View>
            <View style={[styles.plannerBackdropClose, { backgroundColor: colors.card }]}>
              <PandaIcon name="x" size={16} color={colors.mutedForeground} />
            </View>
          </View>
          <View style={[styles.plannerBackdropModes, { backgroundColor: colors.card }]}>
            <Text style={[styles.plannerBackdropMode, { color: colors.mutedForeground }]}>🌅 Morning</Text>
            <Text style={[styles.plannerBackdropMode, { color: colors.mutedForeground }]}>🍽️ Lunch</Text>
            <Text style={[styles.plannerBackdropModeActive, { backgroundColor: colors.green800 }]}>
              {plannerMode === 'morning' ? '🌅 Morning' : plannerMode === 'lunch' ? '🍽️ Lunch' : '🌙 Night'}
            </Text>
          </View>
          {plannerVenues.map((plannerVenue, index) => (
            <View key={`${plannerVenue.id}-${index}`} style={[styles.plannerBackdropStop, { backgroundColor: colors.card }]}>
              <View style={styles.plannerBackdropPhoto}>
                <VenuePhoto venueId={plannerVenue.id} venueName={plannerVenue.name} height={73} />
              </View>
              <View style={styles.plannerBackdropStopCopy}>
                <Text style={[styles.plannerBackdropStopLabel, { color: colors.green700 }]}>
                  {index + 1}. {index === 0 ? 'Dinner' : index === 1 ? 'Drinks' : 'Late night'}
                </Text>
                <Text numberOfLines={1} style={[styles.plannerBackdropStopName, { color: colors.foreground }]}>
                  {plannerVenue.name}
                </Text>
                <Text style={[styles.plannerBackdropStopMeta, { color: colors.mutedForeground }]}>
                  {plannerVenue.rating} · {plannerVenue.walkingTime}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View pointerEvents="none" style={styles.plannerBackdropVeil} />
      </View>

      <View
        style={[
          styles.plannerPreviewCard,
          {
            backgroundColor: '#FFFBF1',
            borderColor: colors.goldLine,
            marginBottom: Math.max(16, insets.bottom + 10),
            marginTop: Math.max(18, insets.top + 12),
          },
        ]}
      >
        <View style={styles.plannerPreviewHero}>
          {photos.length > 0 ? (
            <UniversalSwiper
              activeIndex={photoIndex}
              height={245}
              onIndexChange={setPhotoIndex}
              photos={photos}
              width={previewWidth}
            />
          ) : (
            <VenuePhoto venueId={venue.id} venueName={venue.name} height={245} />
          )}
          <LinearGradient
            colors={['rgba(5,26,20,0.02)', 'rgba(5,26,20,0.62)']}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.plannerHeroCopy}>
            <Text style={styles.plannerHeroEyebrow}>FROM YOUR PANDA PLAN</Text>
            <Text numberOfLines={2} style={styles.plannerHeroTitle}>
              {venue.name}
            </Text>
          </View>
          {photos.length > 1 ? (
            <View pointerEvents="none" style={styles.plannerPreviewPagination}>
              {photos.map((photo, index) => (
                <View
                  key={`${photo.uri}-${index}`}
                  style={[
                    styles.plannerPreviewDot,
                    { backgroundColor: index === photoIndex ? '#FFFFFF' : 'rgba(255,255,255,0.48)' },
                    index === photoIndex && styles.plannerPreviewDotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.plannerPreviewContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.plannerPreviewChips}>
            <MetaChip
              icon="star"
              label={`${displayedRating} (${displayedRatingCount})`}
              background={colors.goldSoft}
              foreground={colors.honeyInk}
            />
            <MetaChip
              label={venue.price || '££'}
              background={colors.muted}
              foreground={colors.green800}
            />
            <MetaChip
              icon="clock"
              label={displayedOpenNow ? 'Open now' : 'Closed'}
              background={displayedOpenNow ? colors.openBackground : colors.closedBackground}
              foreground={displayedOpenNow ? colors.openForeground : colors.closedForeground}
            />
          </View>

          <Text style={[styles.plannerPreviewType, { color: colors.green700 }]}>{displayedType}</Text>
          <Text style={[styles.plannerPreviewDescription, { color: colors.mutedForeground }]}>
            {venue.description}
          </Text>

          <View style={[styles.plannerPreviewAddress, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <PandaIcon name="map-pin" size={18} color={colors.green700} />
            <View style={styles.plannerPreviewAddressCopy}>
              <Text style={[styles.plannerPreviewAddressText, { color: colors.foreground }]}>{displayedAddress}</Text>
              <Text style={[styles.plannerPreviewWalk, { color: colors.mutedForeground }]}>
                {venue.distance} · {venue.walkingTime}
              </Text>
            </View>
          </View>

          <ConciergeTransitCard
            colors={colors}
            compact
            context={transitContext}
            onOpenRoute={onOpenTransitRoute}
            onRetry={onRetryTransit}
            status={transitStatus}
          />

          <View style={styles.plannerPreviewActions}>
            <ActionButton
              label="View menu"
              icon="globe"
              background={colors.honey}
              foreground={colors.honeyInk}
              onPress={onMenu}
            />
            <ActionButton
              label="Reserve"
              icon="calendar"
              background={colors.goldSoft}
              foreground={colors.honeyInk}
              onPress={onReservation}
            />
            <ActionButton
              label="Directions"
              icon="navigate"
              background={colors.green700}
              foreground={colors.primaryForeground}
              onPress={onDirections}
            />
          </View>

          <Pressable
            accessibilityLabel="Back to the same Panda planner"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.plannerReturnButton,
              { backgroundColor: '#FFFBF1', borderColor: colors.goldLine },
              pressed && styles.pressed,
            ]}
          >
            <PandaIcon name="arrow-left" size={17} color={colors.green800} />
            <Text style={[styles.plannerReturnText, { color: colors.green800 }]}>Back to Planner</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function PandaRatingBadge({
  colors,
  rating,
}: {
  colors: ReturnType<typeof useColors>;
  rating: string;
}) {
  const filledStars = Math.max(0, Math.min(5, Math.round(Number.parseFloat(rating))));

  return (
    <View
      accessibilityLabel={`Panda rating ${rating} out of 5`}
      style={[styles.pandaRatingBadge, { backgroundColor: colors.goldSoft, borderColor: colors.goldLine }]}
    >
      <Text style={[styles.pandaRatingLabel, { color: colors.honeyInk }]}>PANDA</Text>
      <View style={styles.pandaRatingStars}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Text
            key={index}
            style={[styles.pandaRatingStar, { color: index < filledStars ? colors.goldDeep : colors.goldLine }]}
          >
            {index < filledStars ? '★' : '☆'}
          </Text>
        ))}
      </View>
      <Text style={[styles.pandaRatingValue, { color: colors.honeyInk }]}>{rating}</Text>
    </View>
  );
}

function ConciergeTransitCard({
  colors,
  compact = false,
  context,
  onOpenRoute,
  onRetry,
  status,
}: {
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
  context: TransitContext | null;
  onOpenRoute: () => void;
  onRetry: () => void;
  status: TransitStatus;
}) {
  if (status === 'idle') return null;

  const venueWalkLabel = context?.venueWalk
    ? `${context.venueWalk.durationMinutes} min walk · ${
        context.venueWalk.distanceMeters < 1000
          ? `${Math.round(context.venueWalk.distanceMeters)} m`
          : `${(context.venueWalk.distanceMeters / 1000).toFixed(1)} km`
      }`
    : 'Nearest rail or Underground station';
  const liveRouteLabel = context?.transitRoute
    ? `${context.transitRoute.durationMinutes} min by public transport · ${context.transitRoute.steps.length} live steps`
    : null;

  const actionable = Boolean(context) || status === 'permission-denied' || status === 'unavailable';
  const actionLabel = context
    ? `Open transit directions from ${context.originStation.name} to ${context.destinationStation.name}`
    : status === 'permission-denied'
      ? 'Allow location to find live transit information'
      : 'Retry live transit information';

  return (
    <Pressable
      accessibilityLabel={actionLabel}
      accessibilityRole={actionable ? 'button' : undefined}
      disabled={!actionable}
      onPress={context ? onOpenRoute : onRetry}
      style={({ pressed }) => [
        styles.transitCard,
        compact && styles.transitCardCompact,
        { backgroundColor: colors.secondary, borderColor: colors.border },
        actionable && styles.transitCardActionable,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.transitTitleRow}>
        <PandaIcon name="map" size={15} color={colors.green700} />
        <Text style={[styles.transitTitle, { color: colors.green800 }]}>LIVE TRANSIT CONTEXT</Text>
      </View>

      {status === 'loading' ? (
        <View style={styles.transitStatusRow}>
          <ActivityIndicator color={colors.green700} size="small" />
          <Text style={[styles.transitStatusText, { color: colors.mutedForeground }]}>
            Finding the nearest stations…
          </Text>
        </View>
      ) : status === 'permission-denied' ? (
        <>
          <Text style={[styles.transitStatusText, { color: colors.mutedForeground }]}>
            Allow location access to see your live station-to-venue route.
          </Text>
          <Text style={[styles.transitActionText, { color: colors.goldDeep }]}>Tap to allow location</Text>
        </>
      ) : context ? (
        <>
          <View style={styles.transitPoint}>
            <View style={[styles.transitPointIcon, { backgroundColor: colors.mint100 }]}>
              <Text style={styles.transitEmoji}>📍</Text>
            </View>
            <View style={styles.transitPointCopy}>
              <Text style={[styles.transitPointLabel, { color: colors.mutedForeground }]}>YOUR NEAREST STATION</Text>
              <Text style={[styles.transitPointName, { color: colors.foreground }]}>{context.originStation.name}</Text>
            </View>
          </View>
          <View style={[styles.transitConnector, { backgroundColor: colors.goldLine }]} />
          <View style={styles.transitPoint}>
            <View style={[styles.transitPointIcon, { backgroundColor: colors.goldSoft }]}>
              <Text style={styles.transitEmoji}>🎯</Text>
            </View>
            <View style={styles.transitPointCopy}>
                <Text style={[styles.transitPointLabel, { color: colors.mutedForeground }]}>
                  VENUE’S NEAREST STATION
                </Text>
              <Text style={[styles.transitPointName, { color: colors.foreground }]}>
                {context.destinationStation.name}
              </Text>
              <Text style={[styles.transitWalk, { color: colors.green700 }]}>{venueWalkLabel}</Text>
            </View>
          </View>
           {liveRouteLabel ? (
             <View style={[styles.transitRouteSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
               <PandaIcon name="navigate" size={14} color={colors.green700} />
               <Text style={[styles.transitRouteSummaryText, { color: colors.foreground }]}>{liveRouteLabel}</Text>
             </View>
           ) : null}
        </>
      ) : (
        <>
          <Text style={[styles.transitStatusText, { color: colors.mutedForeground }]}>
            Live station information is unavailable for this venue right now.
          </Text>
          <Text style={[styles.transitActionText, { color: colors.goldDeep }]}>Tap to try again</Text>
        </>
      )}
      {status === 'ready' ? (
        <Text style={[styles.transitActionText, { color: colors.goldDeep }]}>Get directions in Panda →</Text>
      ) : null}
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Photo Gallery Modal
// -----------------------------------------------------------------------------
function PhotoGallery({
  venue,
  photos,
  visible,
  active,
  width,
  insets,
  onActiveChange,
  onClose,
}: {
  venue: Venue;
  photos: VenuePhotoItem[];
  visible: boolean;
  active: number;
  width: number;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onActiveChange: (index: number) => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <StatusBar style="dark" backgroundColor={colors.ivory} translucent={false} />
      <View style={[styles.gallery, { backgroundColor: colors.green950 }]}>
        <UniversalSwiper
          photos={photos}
          activeIndex={active}
          width={width}
          height={height}
          contentFit="contain"
          backdropColor={colors.green950}
          fixedBackdropUri={photos[0]?.uri}
          centerForeground
          onIndexChange={onActiveChange}
        />

        {/* Top Controls */}
        <View
          style={[
            styles.galleryTop,
            { paddingTop: Platform.OS === 'web' ? 24 : Math.max(20, insets.top) },
          ]}
        >
          <BoutiqueCloseButton
            accessibilityLabel="Close gallery"
            onPress={onClose}
            colors={colors}
            testID="gallery-close"
            containerStyle={styles.galleryCloseBtn}
          />
        </View>

        {/* Bottom Attribution */}
        <View
          style={[
            styles.galleryBottom,
            { paddingBottom: Platform.OS === 'web' ? 32 : Math.max(32, insets.bottom + 10) },
          ]}
        >
          <View style={styles.galleryBottomWrapper}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.galleryBottomInner}>
              <Text
                style={[
                  styles.galleryVenueName,
                  { color: venue.premium ? colors.goldLine : colors.primaryForeground },
                ]}
                numberOfLines={1}
              >
                {venue.name}
              </Text>
              <Text style={styles.galleryAttribution} numberOfLines={2}>
                Photo by {photos[active]?.attribution || 'Unknown'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Universal Swiper (Web PanResponder + Native ScrollView)
// -----------------------------------------------------------------------------
function UniversalSwiper({
  photos,
  activeIndex,
  width,
  height,
  onIndexChange,
  onPhotoTap,
  contentFit = 'cover',
  backdropColor,
  fixedBackdropUri,
  centerForeground = false,
}: {
  photos: VenuePhotoItem[];
  activeIndex: number;
  width: number;
  height: DimensionValue;
  onIndexChange: (idx: number) => void;
  onPhotoTap?: () => void;
  contentFit?: 'cover' | 'contain';
  backdropColor?: string;
  fixedBackdropUri?: string;
  centerForeground?: boolean;
}) {
  const isWeb = Platform.OS === 'web';
  const scrollRef = useRef<ScrollView>(null);
  const lastIndex = useRef(activeIndex);

  // Sync index externally on native
  useEffect(() => {
    if (!isWeb && scrollRef.current && lastIndex.current !== activeIndex) {
      scrollRef.current.scrollTo({ x: activeIndex * width, animated: false });
      lastIndex.current = activeIndex;
    }
  }, [activeIndex, width, isWeb]);

  const renderPhoto = (photo: VenuePhotoItem, index: number) => (
    <Pressable
      accessibilityLabel={`Photo ${index + 1}`}
      key={`${photo.uri}-${index}`}
      style={{ width, height }}
      onPress={onPhotoTap}
    >
      {contentFit === 'contain' && backdropColor ? (
        <>
          <Image
            source={{ uri: fixedBackdropUri ?? photo.uri }}
            contentFit="cover"
            blurRadius={4}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: 0.78 }]}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor, opacity: 0.18 }]}
          />
        </>
      ) : null}
      {centerForeground ? (
        <View pointerEvents="none" style={styles.galleryForegroundFrame}>
          <Image
            source={{ uri: photo.uri }}
            contentFit={contentFit}
            contentPosition="center"
            transition={250}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : (
        <Image
          source={{ uri: photo.uri }}
          contentFit={contentFit}
          contentPosition={contentFit === 'contain' ? 'center' : 'center'}
          transition={250}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      )}
    </Pressable>
  );

  if (isWeb) {
    const pan = useRef(new Animated.Value(-activeIndex * width)).current;
    const indexRef = useRef(activeIndex);

    // Sync index externally on web
    useEffect(() => {
      if (indexRef.current !== activeIndex) {
        Animated.spring(pan, {
          toValue: -activeIndex * width,
          useNativeDriver: false,
        }).start();
        indexRef.current = activeIndex;
      }
    }, [activeIndex, width, pan]);

    const panResponder = useRef(
      PanResponder.create({
        onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 10,
        onMoveShouldSetPanResponderCapture: (evt, gestureState) =>
          Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          pan.stopAnimation();
          pan.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
        onPanResponderRelease: (evt, gestureState) => {
          pan.flattenOffset();
          let newIndex = indexRef.current;
          if (gestureState.dx > 50 && newIndex > 0) {
            newIndex--;
          } else if (gestureState.dx < -50 && newIndex < photos.length - 1) {
            newIndex++;
          }

          Animated.spring(pan, {
            toValue: -newIndex * width,
            useNativeDriver: false,
            bounciness: 0,
            speed: 20,
          }).start();

          if (newIndex !== indexRef.current) {
            indexRef.current = newIndex;
            onIndexChange(newIndex);
          }
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          Animated.spring(pan, {
            toValue: -indexRef.current * width,
            useNativeDriver: false,
            bounciness: 0,
            speed: 20,
          }).start();
        },
        onPanResponderTerminationRequest: () => false,
      })
    ).current;

    return (
      <View
        style={[{ width, height, overflow: 'hidden' }, { cursor: 'grab' as any }]}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: pan }] }}>
          {photos.map(renderPhoto)}
        </Animated.View>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      style={{ width, height }}
      onMomentumScrollEnd={(e) => {
        const newIdx = Math.round(e.nativeEvent.contentOffset.x / width);
        lastIndex.current = newIdx;
        onIndexChange(newIdx);
      }}
    >
      {photos.map(renderPhoto)}
    </ScrollView>
  );
}

// -----------------------------------------------------------------------------
// Small Shared Components
// -----------------------------------------------------------------------------
function MetaChip({
  label,
  icon,
  background,
  foreground,
}: {
  label: string;
  icon?: PandaIconName;
  background: string;
  foreground: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      {icon && <PandaIcon name={icon} size={13} color={foreground} />}
      <Text style={[styles.chipText, { color: foreground }]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  background,
  foreground,
  full = false,
  onPress,
}: {
  label: string;
  icon: PandaIconName;
  background: string;
  foreground: string;
  full?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        full && styles.actionFull,
        { backgroundColor: background },
        pressed && styles.pressed,
      ]}
    >
      <PandaIcon name={icon} size={19} color={foreground} />
      <Text style={[styles.actionText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

function openExternal(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert('Unable to open', 'This link could not be opened on this device.'),
  );
}

function BoutiqueCloseButton({
  accessibilityLabel,
  onPress,
  colors,
  testID,
  containerStyle,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.boutiqueClose, containerStyle, pressed && styles.pressed]}
    >
      <View style={[styles.boutiqueCloseInner, { backgroundColor: colors.ivory, borderColor: colors.goldLine }]}>
        <BlurView intensity={46} tint="light" style={StyleSheet.absoluteFill} />
        <PandaIcon name="x" size={21} color={colors.green900} />
      </View>
    </Pressable>
  );
}

// -----------------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  plannerPreviewScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  plannerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  plannerBackdropContent: {
    flex: 1,
    opacity: 0.72,
    paddingHorizontal: 18,
    paddingTop: 44,
  },
  plannerBackdropHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  plannerBackdropTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  plannerBackdropSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 3,
  },
  plannerBackdropClose: {
    alignItems: 'center',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  plannerBackdropModes: {
    borderRadius: 14,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    padding: 4,
  },
  plannerBackdropMode: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 9,
  },
  plannerBackdropModeActive: {
    borderRadius: 10,
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  plannerBackdropStop: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 15,
    minHeight: 85,
    padding: 6,
  },
  plannerBackdropPhoto: {
    borderRadius: 11,
    height: 73,
    overflow: 'hidden',
    width: 78,
  },
  plannerBackdropStopCopy: {
    flex: 1,
    marginLeft: 10,
  },
  plannerBackdropStopLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  plannerBackdropStopName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    marginTop: 4,
  },
  plannerBackdropStopMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    marginTop: 5,
  },
  plannerBackdropVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(214, 235, 217, 0.62)',
  },
  plannerPreviewCard: {
    borderRadius: 28,
    borderWidth: 1,
    elevation: 18,
    height: '72%',
    maxHeight: 640,
    overflow: 'hidden',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    width: '94%',
  },
  plannerPreviewHero: {
    height: 190,
    overflow: 'hidden',
    position: 'relative',
  },
  plannerHeroCopy: {
    bottom: 15,
    left: 18,
    position: 'absolute',
    right: 18,
  },
  plannerHeroEyebrow: {
    color: '#F5D98C',
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 1.2,
  },
  plannerHeroTitle: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  plannerPreviewPagination: {
    bottom: 17,
    flexDirection: 'row',
    gap: 5,
    position: 'absolute',
    right: 18,
  },
  plannerPreviewDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  plannerPreviewDotActive: {
    width: 17,
  },
  plannerPreviewContent: {
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 15,
  },
  plannerPreviewChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  plannerPreviewType: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    marginTop: 13,
  },
  plannerPreviewDescription: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  plannerPreviewAddress: {
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    padding: 12,
  },
  plannerPreviewAddressCopy: {
    flex: 1,
  },
  plannerPreviewAddressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
  },
  plannerPreviewWalk: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 5,
  },
  plannerPreviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  transitCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  transitCardCompact: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  transitCardActionable: {
    borderWidth: 1.5,
  },
  transitTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 11,
  },
  transitTitle: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.05,
  },
  pandaRatingBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  pandaRatingLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 0.65,
  },
  pandaRatingStars: {
    flexDirection: 'row',
    gap: 1,
  },
  pandaRatingStar: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    lineHeight: 10,
  },
  pandaRatingValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  transitLivePill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  transitLiveDot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  transitLiveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
  },
  transitStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  transitStatusText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  transitActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    marginTop: 8,
  },
  transitPoint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  transitPointIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  transitEmoji: {
    fontSize: 13,
  },
  transitPointCopy: {
    flex: 1,
    minWidth: 0,
  },
  transitPointLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.75,
  },
  transitPointName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    marginTop: 2,
  },
  transitWalk: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    marginTop: 3,
  },
  transitConnector: {
    height: 12,
    marginLeft: 13,
    marginVertical: 2,
    width: 2,
  },
  transitRouteSummary: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  transitRouteSummaryText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    lineHeight: 13,
  },
  plannerReturnButton: {
    alignSelf: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 15,
    minHeight: 48,
    minWidth: 190,
    paddingHorizontal: 22,
  },
  plannerReturnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  detailsPanel: {
    flex: 1,
    marginTop: -32,
    minHeight: 0,
    zIndex: 2,
  },
  detailsScroll: {
    flex: 1,
    minHeight: 0,
  },
  pinnedHeader: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 3,
  },
  detailsContent: {
    paddingHorizontal: 24,
  },
  floatingClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  boutiqueClose: {
    alignItems: 'center',
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  boutiqueCloseInner: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 5,
    height: 38,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
    width: 38,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pagination: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 78,
  },
  body: {
    marginTop: -32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  gripContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  grip: {
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.6,
  },
  premiumLabel: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
    marginTop: 12,
    marginBottom: 10,
    elevation: 2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  premiumLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 32,
    letterSpacing: -0.7,
    marginBottom: 12,
  },
  venueTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  venueTitle: {
    flex: 1,
    marginBottom: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  chip: {
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  description: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  contextPanel: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 6,
  },
  conciergeStack: {
    marginBottom: 0,
  },
  scoreCard: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.11,
    shadowRadius: 7,
    elevation: 2,
  },
  scoreCardCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 9,
  },
  scoreCardIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  scoreCardWords: {
    flex: 1,
  },
  scoreCardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  scoreCardSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    marginTop: 2,
  },
  scoreValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingLeft: 8,
  },
  scoreValueText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  vibeSection: {
    paddingTop: 10,
  },
  vibeSectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  vibeSectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  vibeSectionSource: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
  },
  vibeRow: {
    paddingRight: 10,
  },
  vibeChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginRight: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  vibeChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    fontWeight: '700',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 0,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  address: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 18,
  },
  action: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: '45%',
    paddingHorizontal: 12,
  },
  actionFull: {
    flexBasis: '100%',
  },
  actionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  notFound: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  notFoundTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  primaryAction: {
    borderRadius: 999,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  primaryActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  gallery: {
    flex: 1,
  },
  galleryTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  galleryCloseBtn: {
    marginRight: -3,
  },
  galleryBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    zIndex: 10,
  },
  galleryBottomWrapper: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    maxWidth: '84%',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  galleryBottomInner: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  galleryForegroundFrame: {
    position: 'absolute',
    top: '11%',
    right: '7%',
    bottom: '23%',
    left: '7%',
    overflow: 'hidden',
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,253,248,0.28)',
    backgroundColor: 'rgba(3,59,43,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  galleryVenueName: {
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.3,
    lineHeight: 21,
    marginBottom: 2,
  },
  galleryAttribution: {
    color: '#A0AAB2',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15,
  },
});
