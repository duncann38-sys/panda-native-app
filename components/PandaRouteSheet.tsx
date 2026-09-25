import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

export type WalkingStep = {
  instruction: string;
  distanceMeters: number;
  durationMinutes: number;
  endLocation: { latitude: number; longitude: number };
};

export type TransitStep = {
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
};

export type TransitRouteContext = {
  originName: string;
  destinationName: string;
  originWalkMinutes: string;
  originWalkDistance: string;
  durationMinutes: string;
  distanceMeters: string;
  steps: TransitStep[];
  walkMinutes: string;
  walkDistance: string;
  updatedAt?: string;
};

type Props = {
  venue: Venue;
  transitRoute: TransitRouteContext | null;
  walkingRoute: { distanceMeters: number; durationMinutes: number; steps?: WalkingStep[] } | null;
  mode: 'walking' | 'transit';
  onModeChange: (mode: 'walking' | 'transit') => void;
  onClose: () => void;
  closeLabel: string;
  insetsBottom: number;
  hasMappedRoute: boolean;
  transitAvailable: boolean;
  navigationActive: boolean;
  navigationStepIndex: number;
  navigationError: string | null;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  onNavigationStepChange: (index: number) => void;
  onRefreshTransit: () => void;
  transitRefreshing: boolean;
  transitError?: string | null;
  onReroute: () => void;
};

function distance(value: number | string | null | undefined): string | null {
  if (value === '' || value == null) return null;
  const metres = Number(value);
  if (!Number.isFinite(metres) || metres < 0) return null;
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

function minutes(value: number | string | null | undefined): string | null {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? `${Math.round(number)} min` : null;
}

function localTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const timeOnly = value.match(/^(\d{1,2}):(\d{2})(?:\s?([ap]m))?$/i);
  if (timeOnly) {
    const suffix = timeOnly[3] ? ` ${timeOnly[3].toUpperCase()}` : '';
    return `${timeOnly[1].padStart(2, '0')}:${timeOnly[2]}${suffix}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function localDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function departureCountdown(value: string | null | undefined, now: number): string | null {
  const departure = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(departure)) return null;
  const remaining = Math.ceil((departure - now) / 60_000);
  if (remaining < 0) return 'Time passed · refresh';
  if (remaining > 120) return null;
  return remaining === 0 ? 'Due now' : `In ${remaining} min`;
}

function RoutePoint({ label, name, end = false }: { label: string; name: string; end?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.pointRow}>
      <View style={styles.railCell}>
        <View style={[styles.pointDot, { backgroundColor: end ? colors.gold : colors.green700 }]} />
        {!end ? <View style={[styles.railStem, { backgroundColor: colors.goldLine }]} /> : null}
      </View>
      <View style={styles.pointText}>
        <Text style={[styles.pointLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.pointName, { color: colors.foreground }]}>{name}</Text>
      </View>
    </View>
  );
}

export default function PandaRouteSheet({
  venue,
  transitRoute,
  walkingRoute,
  mode,
  onModeChange,
  onClose,
  closeLabel,
  insetsBottom,
  hasMappedRoute,
  transitAvailable,
  navigationActive,
  navigationStepIndex,
  navigationError,
  onStartNavigation,
  onStopNavigation,
  onNavigationStepChange,
  onRefreshTransit,
  transitRefreshing,
  transitError,
  onReroute,
}: Props) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const showingTransit = mode === 'transit' && (transitAvailable || !!transitRoute);
  useEffect(() => {
    if (!showingTransit) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [showingTransit]);
  const hasSteps = !!transitRoute?.steps.length;
  const walkingSteps = walkingRoute?.steps ?? [];
  const hasWalkingSteps = walkingSteps.length > 0;
  const activeStepIndex = Math.max(0, Math.min(navigationStepIndex, walkingSteps.length - 1));
  const activeStep = walkingSteps[activeStepIndex];
  const nextStep = walkingSteps[activeStepIndex + 1];
  const transitUpdatedAt = transitRoute?.updatedAt
    ?? transitRoute?.steps.find((step) => step.liveUpdatedAt)?.liveUpdatedAt
    ?? null;
  const formattedUpdatedAt = localDateTime(transitUpdatedAt);
  const walkTime = walkingRoute ? minutes(walkingRoute.durationMinutes) : venue.walkingTime || null;
  const walkDistance = walkingRoute ? distance(walkingRoute.distanceMeters) : venue.distance || null;
  const transitTime = minutes(transitRoute?.durationMinutes);
  const transitDistance = distance(transitRoute?.distanceMeters);
  const summaryTime = showingTransit ? transitTime : walkTime;
  const summaryDistance = showingTransit ? transitDistance : walkDistance;
  const routeStatus = showingTransit
    ? !transitRoute
      ? transitRefreshing
        ? 'Checking for available transit connections.'
        : 'Transit details are unavailable. Refresh to check again.'
      : hasMappedRoute
        ? 'Available route sections are drawn on the map. Follow the steps here as you go.'
        : 'Station details are shown here; a route line is not available.'
    : hasMappedRoute
      ? hasWalkingSteps
        ? 'Your walking route is drawn on the map. Start navigation for step-by-step guidance.'
        : 'Your walking route is drawn on the map. Step-by-step guidance is not available.'
      : 'Your destination is pinned on the map. A walking route line is not available.';

  return (
    <View
      accessibilityLabel={`Directions to ${venue.name}`}
      style={[
        styles.sheet,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.green950,
          bottom: 88 + Math.max(insetsBottom, Platform.OS === 'android' ? 24 : 0),
          maxHeight: height * 0.68,
        },
      ]}
    >
      <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.green700 }]}>PANDA DIRECTIONS</Text>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>The way to {venue.name}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          testID="route-sheet-close"
          hitSlop={8}
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: colors.secondary }]}
        >
          <Ionicons name="close" size={21} color={colors.green800} />
        </Pressable>
      </View>

      {transitRoute || transitAvailable ? (
        <View accessibilityRole="tablist" style={[styles.modes, { backgroundColor: colors.secondary }]}>
          {(['walking', 'transit'] as const).map((choice) => {
            const selected = mode === choice;
            return (
              <Pressable
                key={choice}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${choice === 'walking' ? 'Walking' : 'Public transport'} directions`}
                testID={`route-mode-${choice}`}
                onPress={() => onModeChange(choice)}
                style={[styles.modeButton, selected && { backgroundColor: colors.green800 }]}
              >
                <Ionicons
                  name={choice === 'walking' ? 'walk-outline' : 'train-outline'}
                  size={17}
                  color={selected ? colors.primaryForeground : colors.green800}
                />
                <Text style={[styles.modeText, { color: selected ? colors.primaryForeground : colors.green800 }]}>
                  {choice === 'walking' ? 'Walk' : 'Transit'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.overview, { backgroundColor: colors.secondary }]}>
        <View style={[styles.overviewIcon, { backgroundColor: colors.card }]}>
          <Ionicons name={showingTransit ? 'train-outline' : 'walk-outline'} size={21} color={colors.green800} />
        </View>
        <View style={styles.overviewCopy}>
          <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>
            {showingTransit ? 'QUICKEST TRANSIT ROUTE' : walkingRoute ? 'WALKING ROUTE' : 'WALKING ESTIMATE'}
          </Text>
          <Text style={[styles.overviewValue, { color: colors.foreground }]}>
            {summaryTime ?? (showingTransit ? transitRefreshing ? 'Finding fastest route…' : 'Transit time unavailable' : 'Time unavailable')}
            {summaryDistance ? <Text style={[styles.overviewDistance, { color: colors.mutedForeground }]}>  ·  {summaryDistance}</Text> : null}
          </Text>
        </View>
      </View>

      {showingTransit ? (
        <View style={[styles.quickestBanner, { backgroundColor: colors.goldSoft }]}>
          <View style={styles.quickestCopy}>
            <Text style={[styles.quickestTitle, { color: colors.goldDeep }]}>QUICKEST ROUTE</Text>
            <Text style={[styles.quickestSubtitle, { color: colors.mutedForeground }]}>
              Live departures are marked; other times are Google estimates.
            </Text>
            {formattedUpdatedAt ? (
              <Text testID="transit-updated-at" style={[styles.updatedAtInline, { color: colors.mutedForeground }]}>
                Updated {formattedUpdatedAt}
              </Text>
            ) : null}
            {transitRoute && transitUpdatedAt && now - Date.parse(transitUpdatedAt) > 120_000 ? (
              <Text style={[styles.updatedAtInline, { color: colors.goldDeep }]}>Times may have changed · refresh</Text>
            ) : null}
            {transitError ? <Text style={[styles.updatedAtInline, { color: colors.goldDeep }]}>{transitError}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={transitRefreshing ? 'Refreshing transit departures' : 'Refresh transit departures'}
            accessibilityState={{ disabled: transitRefreshing, busy: transitRefreshing }}
            testID="transit-refresh"
            disabled={transitRefreshing}
            onPress={onRefreshTransit}
            style={[styles.refreshButton, { backgroundColor: colors.card, opacity: transitRefreshing ? 0.65 : 1 }]}
          >
            <Ionicons name={transitRefreshing ? 'time-outline' : 'refresh-outline'} size={17} color={colors.green800} />
            <Text style={[styles.refreshText, { color: colors.green800 }]}>{transitRefreshing ? 'Refreshing' : 'Refresh'}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={styles.detailsScroll}
        contentContainerStyle={styles.detailsContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
      {showingTransit && transitRoute ? (
        <>
          <View style={[styles.points, { borderBottomColor: colors.border }]}>
            <RoutePoint label="BOARD AT" name={transitRoute.originName} />
            <RoutePoint label="GET OFF AT" name={transitRoute.destinationName} end />
          </View>
          {hasSteps ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={stepsExpanded ? 'Hide transit steps' : 'Show transit steps'}
              accessibilityState={{ expanded: stepsExpanded }}
              testID="route-steps-toggle"
              onPress={() => setStepsExpanded((value) => !value)}
              style={styles.expandButton}
            >
              <View>
                <Text style={[styles.expandTitle, { color: colors.green800 }]}>
                  {stepsExpanded ? 'Hide journey steps' : 'See journey steps'}
                </Text>
                {!stepsExpanded ? <Text style={[styles.expandSubtitle, { color: colors.mutedForeground }]}>
                  {transitRoute.steps.length} {transitRoute.steps.length === 1 ? 'step' : 'steps'} from the route
                </Text> : null}
              </View>
              <Ionicons name={stepsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.green800} />
            </Pressable>
          ) : (
            <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>
              Detailed transit steps aren’t available for this journey.
            </Text>
          )}
          {stepsExpanded && hasSteps ? (
            <View style={styles.stepsContent}>
              {transitRoute.originWalkMinutes && transitRoute.steps[0]?.mode !== 'WALK' ? (
                <View style={styles.leg}>
                  <View style={[styles.legIcon, { backgroundColor: colors.secondary }]}>
                    <Ionicons name="walk-outline" size={17} color={colors.green800} />
                  </View>
                  <View style={styles.legCopy}>
                    <Text style={[styles.legTitle, { color: colors.foreground }]}>Walk to {transitRoute.originName}</Text>
                    <Text style={[styles.legMeta, { color: colors.mutedForeground }]}>
                      {minutes(transitRoute.originWalkMinutes)}
                      {distance(transitRoute.originWalkDistance) ? ` · ${distance(transitRoute.originWalkDistance)}` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}
              {transitRoute.steps.map((step, index) => (
                // Predictions are only labelled live while the feed's own timestamp is fresh.
                <View key={`${index}-${step.mode}-${step.instruction}`} style={styles.leg}>
                  <View style={[styles.legIcon, { backgroundColor: step.mode === 'TRANSIT' ? colors.goldSoft : colors.secondary }]}>
                    <Ionicons
                      name={step.mode === 'TRANSIT' ? 'train-outline' : 'walk-outline'}
                      size={17}
                      color={step.mode === 'TRANSIT' ? colors.goldDeep : colors.green800}
                    />
                  </View>
                  <View style={[styles.legCopy, index < transitRoute.steps.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <Text style={[styles.legKicker, { color: step.mode === 'TRANSIT' ? colors.goldDeep : colors.green700 }]}>
                      {step.mode === 'TRANSIT' ? step.lineName || 'PUBLIC TRANSPORT' : 'WALK'}
                    </Text>
                    <Text style={[styles.legTitle, { color: colors.foreground }]}>{step.instruction}</Text>
                    {step.mode === 'TRANSIT' && step.headsign ? (
                      <Text style={[styles.legDetail, { color: colors.mutedForeground }]}>Towards {step.headsign}</Text>
                    ) : null}
                    {step.mode === 'TRANSIT' && (step.departureStop || step.arrivalStop) ? (
                      <Text style={[styles.legDetail, { color: colors.mutedForeground }]}>
                        {[step.departureStop, step.arrivalStop].filter(Boolean).join(' → ')}
                      </Text>
                    ) : null}
                    {step.mode === 'TRANSIT' ? (
                      <View style={styles.departureDetails}>
                        {step.liveDepartureTime && step.liveUpdatedAt
                          && now - Date.parse(step.liveUpdatedAt) < 90_000 ? (
                          <Text style={[styles.liveBadge, { color: colors.openForeground, backgroundColor: colors.openBackground }]}>
                            LIVE · TfL
                          </Text>
                        ) : (
                          <Text style={[styles.estimateBadge, { color: colors.mutedForeground, backgroundColor: colors.secondary }]}>
                            GOOGLE ESTIMATE
                          </Text>
                        )}
                        {localTime(step.liveDepartureTime && step.liveUpdatedAt
                          && now - Date.parse(step.liveUpdatedAt) < 90_000
                          ? step.liveDepartureTime : step.departureTime) ? (
                          <Text style={[styles.legDetail, { color: colors.foreground }]}>
                            Departs {localTime(step.liveDepartureTime && step.liveUpdatedAt
                              && now - Date.parse(step.liveUpdatedAt) < 90_000
                              ? step.liveDepartureTime : step.departureTime)}
                            {'  ·  '}{departureCountdown(step.liveDepartureTime && step.liveUpdatedAt
                              && now - Date.parse(step.liveUpdatedAt) < 90_000
                              ? step.liveDepartureTime : step.departureTime, now)}
                          </Text>
                        ) : null}
                        {localTime(step.arrivalTime) ? (
                          <Text style={[styles.legDetail, { color: colors.mutedForeground }]}>
                            Arrives {localTime(step.arrivalTime)}
                          </Text>
                        ) : null}
                        {step.platform ? (
                          <Text style={[styles.legDetail, { color: colors.mutedForeground }]}>Platform {step.platform}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={[styles.legMeta, { color: colors.mutedForeground }]}>
                      {minutes(step.durationMinutes) ?? 'Time unavailable'}
                      {distance(step.distanceMeters) ? ` · ${distance(step.distanceMeters)}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
              {transitRoute.steps[transitRoute.steps.length - 1]?.mode !== 'WALK' ? <View style={styles.leg}>
                <View style={[styles.legIcon, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="walk-outline" size={17} color={colors.green800} />
                </View>
                <View style={styles.legCopy}>
                  <Text style={[styles.legTitle, { color: colors.foreground }]}>Walk to {venue.name}</Text>
                  {transitRoute.walkMinutes || transitRoute.walkDistance ? (
                    <Text style={[styles.legMeta, { color: colors.mutedForeground }]}>
                      {[minutes(transitRoute.walkMinutes), distance(transitRoute.walkDistance)].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View> : null}
            </View>
          ) : null}
        </>
      ) : showingTransit ? (
        <View testID="transit-empty-state" accessibilityLiveRegion="polite" style={[styles.transitEmpty, { backgroundColor: colors.secondary }]}>
          <Ionicons name={transitRefreshing ? 'time-outline' : 'train-outline'} size={21} color={colors.green800} />
          <Text style={[styles.transitEmptyTitle, { color: colors.foreground }]}>
            {transitRefreshing ? 'Finding the quickest transit route…' : 'Transit itinerary unavailable'}
          </Text>
          <Text style={[styles.transitEmptyText, { color: colors.mutedForeground }]}>
             {transitRefreshing
               ? 'Checking available connections and departure times.'
               : transitError || 'No route details are available right now. Refresh to try again.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.walkingDestination}>
            <Ionicons name="location-outline" size={18} color={colors.green700} />
            <Text numberOfLines={2} style={[styles.walkingDestinationText, { color: colors.foreground }]}>
              From your location to {venue.name}
            </Text>
          </View>
          {navigationActive ? (
            <View style={[styles.navigationCard, { backgroundColor: colors.secondary }]}>
              {activeStep ? (
                <>
              <View style={styles.navigationHeading}>
                <Text style={[styles.navigationKicker, { color: colors.green700 }]}>STEP {activeStepIndex + 1} OF {walkingSteps.length}</Text>
                <Text style={[styles.navigationMeta, { color: colors.mutedForeground }]}>
                  {minutes(activeStep.durationMinutes) ?? 'Time unavailable'}
                  {distance(activeStep.distanceMeters) ? ` · ${distance(activeStep.distanceMeters)}` : ''}
                </Text>
              </View>
              <Text testID="navigation-current-step" accessibilityLiveRegion="polite" style={[styles.navigationInstruction, { color: colors.foreground }]}>
                {activeStep.instruction}
              </Text>
              {nextStep ? (
                <Text testID="navigation-next-step" style={[styles.nextInstruction, { color: colors.mutedForeground }]}>
                  Next: {nextStep.instruction}
                </Text>
              ) : (
                <Text style={[styles.nextInstruction, { color: colors.green700 }]}>Final step · You’re nearly there</Text>
              )}
              <View style={styles.navigationControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous navigation step"
                  testID="navigation-previous"
                  disabled={activeStepIndex === 0}
                  onPress={() => onNavigationStepChange(activeStepIndex - 1)}
                  style={[styles.navigationControl, { backgroundColor: colors.card, opacity: activeStepIndex === 0 ? 0.45 : 1 }]}
                >
                  <Ionicons name="chevron-back" size={17} color={colors.green800} />
                  <Text style={[styles.navigationControlText, { color: colors.green800 }]}>Previous</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next navigation step"
                  testID="navigation-next"
                  disabled={activeStepIndex >= walkingSteps.length - 1}
                  onPress={() => onNavigationStepChange(activeStepIndex + 1)}
                  style={[styles.navigationControl, { backgroundColor: colors.card, opacity: activeStepIndex >= walkingSteps.length - 1 ? 0.45 : 1 }]}
                >
                  <Text style={[styles.navigationControlText, { color: colors.green800 }]}>Next</Text>
                  <Ionicons name="chevron-forward" size={17} color={colors.green800} />
                </Pressable>
              </View>
                </>
              ) : (
                <Text accessibilityLiveRegion="polite" style={[styles.navigationInstruction, { color: colors.foreground }]}>
                  Updating walking directions from your location…
                </Text>
              )}
               <Pressable
                 accessibilityRole="button"
                 accessibilityLabel="Update walking route from your current location"
                 testID="navigation-reroute"
                 onPress={onReroute}
                 style={[styles.stopNavigation, { backgroundColor: colors.card }]}
               >
                 <Ionicons name="refresh-outline" size={17} color={colors.green800} />
                 <Text style={[styles.stopNavigationText, { color: colors.green800 }]}>Update route from here</Text>
               </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop navigation"
                testID="navigation-stop"
                onPress={onStopNavigation}
                style={[styles.stopNavigation, { backgroundColor: colors.closedBackground }]}
              >
                <Ionicons name="stop-circle-outline" size={17} color={colors.closedForeground} />
                <Text style={[styles.stopNavigationText, { color: colors.closedForeground }]}>Stop navigation</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start walking navigation"
              testID="navigation-start"
              disabled={!hasWalkingSteps}
              onPress={onStartNavigation}
              style={[styles.startNavigation, { backgroundColor: colors.green800, opacity: hasWalkingSteps ? 1 : 0.55 }]}
            >
              <Ionicons name="navigate-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.startNavigationText, { color: colors.primaryForeground }]}>
                {hasWalkingSteps ? 'Start navigation' : 'Step guidance unavailable'}
              </Text>
            </Pressable>
          )}
          {navigationError ? (
            <View testID="navigation-error" accessibilityRole="alert" style={[styles.navigationError, { backgroundColor: colors.closedBackground }]}>
              <Ionicons name="location-outline" size={17} color={colors.closedForeground} />
              <Text style={[styles.navigationErrorText, { color: colors.closedForeground }]}>{navigationError}</Text>
            </View>
          ) : null}
        </>
      )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Ionicons name={hasMappedRoute ? 'map-outline' : 'information-circle-outline'} size={16} color={colors.mutedForeground} />
        <Text style={[styles.status, { color: colors.mutedForeground }]}>{routeStatus}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingTop: 9,
    shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 34, height: 4, borderRadius: 5, marginBottom: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 },
  headerCopy: { flex: 1, paddingTop: 2 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.45, marginBottom: 5 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5 },
  closeButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modes: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 13 },
  modeButton: { flex: 1, minHeight: 38, borderRadius: 11, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 13, fontWeight: '700' },
  overview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 15, marginBottom: 14 },
  overviewIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overviewCopy: { flex: 1 },
  overviewLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 2 },
  overviewValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.35 },
  overviewDistance: { fontSize: 13, fontWeight: '500', letterSpacing: 0 },
  quickestBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, padding: 10, marginBottom: 5 },
  quickestCopy: { flex: 1 },
  quickestTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  quickestSubtitle: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  refreshButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 10 },
  refreshText: { fontSize: 11, fontWeight: '700' },
  detailsScroll: { flexShrink: 1 },
  detailsContent: { paddingBottom: 4 },
  points: { marginHorizontal: 2, borderBottomWidth: 1, paddingBottom: 2 },
  pointRow: { flexDirection: 'row', minHeight: 47 },
  railCell: { width: 27, alignItems: 'center', paddingTop: 5 },
  pointDot: { width: 9, height: 9, borderRadius: 5 },
  railStem: { width: 2, flex: 1, marginTop: 5, marginBottom: -5 },
  pointText: { flex: 1, paddingBottom: 9 },
  pointLabel: { fontSize: 9, letterSpacing: 1.1, fontWeight: '800', marginBottom: 3 },
  pointName: { fontSize: 14, fontWeight: '700' },
  expandButton: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  expandTitle: { fontSize: 13, fontWeight: '800' },
  expandSubtitle: { fontSize: 11, marginTop: 2 },
  unavailable: { fontSize: 12, lineHeight: 17, paddingVertical: 11 },
  stepsContent: { paddingTop: 7, paddingBottom: 9 },
  leg: { flexDirection: 'row', gap: 11 },
  legIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  legCopy: { flex: 1, paddingBottom: 14, marginBottom: 12 },
  legKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, marginBottom: 3 },
  legTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  legDetail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  legMeta: { fontSize: 11, marginTop: 5 },
  departureDetails: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6 },
  liveBadge: { overflow: 'hidden', fontSize: 9, fontWeight: '900', letterSpacing: 0.4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  estimateBadge: { overflow: 'hidden', fontSize: 9, fontWeight: '800', letterSpacing: 0.35, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  updatedAtInline: { fontSize: 10, marginTop: 2 },
  transitEmpty: { alignItems: 'center', padding: 18, borderRadius: 14, gap: 6, marginTop: 7 },
  transitEmptyTitle: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  transitEmptyText: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  walkingDestination: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3, paddingBottom: 14 },
  walkingDestinationText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  startNavigation: { minHeight: 45, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  startNavigationText: { fontSize: 13, fontWeight: '800' },
  navigationCard: { padding: 12, borderRadius: 15, marginBottom: 10 },
  navigationHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  navigationKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  navigationMeta: { fontSize: 10 },
  navigationInstruction: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  nextInstruction: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  navigationControls: { flexDirection: 'row', gap: 8, marginTop: 11 },
  navigationControl: { flex: 1, minHeight: 37, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  navigationControlText: { fontSize: 11, fontWeight: '700' },
  stopNavigation: { minHeight: 36, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  stopNavigationText: { fontSize: 11, fontWeight: '700' },
  navigationError: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 11, marginBottom: 8 },
  navigationErrorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  footer: { borderTopWidth: 1, paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  status: { flex: 1, fontSize: 11, lineHeight: 16 },
});