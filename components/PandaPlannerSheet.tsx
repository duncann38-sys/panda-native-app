import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
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

export type PlannerMode = 'morning' | 'lunch' | 'night';

type PlannerStop = {
  icon: string;
  label: string;
  categories: Array<Venue['category']>;
  terms?: string[];
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
      { icon: '🌙', label: 'Late night', categories: ['Bar', 'Pub'], terms: ['bar', 'pub', 'rooftop', 'cocktail'] },
    ],
  },
};

const PRICE_OPTIONS = ['££', '£££', '££££'] as const;

function defaultMode(): PlannerMode {
  return getPandaTimeMode();
}

function venueScore(venue: Venue) {
  return Number(venue.rating || 0) * Math.log(venue.ratingCount + 10);
}

function getPlan(mode: PlannerMode, price: string, location: string, offset: number) {
  const used = new Set<string>();
  const locationQuery = location.trim().toLowerCase();
  const googleVenues = venues.filter((venue) => venue.id.startsWith('ChI'));
  const nearby = googleVenues.filter((venue) => {
    const withinPrice = Math.max(1, venue.price.length || 2) <= price.length;
    const withinArea =
      !locationQuery ||
      locationQuery === 'current location' ||
      [venue.neighborhood, venue.fullAddress].join(' ').toLowerCase().includes(locationQuery);
    return withinPrice && withinArea;
  });
  const source = nearby.length >= 3
    ? nearby
    : googleVenues.filter((venue) => Math.max(1, venue.price.length || 2) <= price.length);

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
    const venue = pool[(offset + stopIndex) % Math.max(1, Math.min(pool.length, 8))] ?? googleVenues[stopIndex];
    used.add(venue.id);
    return venue;
  });
}

function walkBetween(first: Venue, second: Venue) {
  const metres = Math.max(180, Math.abs(first.distanceMeters - second.distanceMeters) + 260);
  return `~${Math.max(3, Math.round(metres / 80))} min walk`;
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
  onOpenMap: (plan: Venue[], mode: PlannerMode) => void;
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
  const [shuffle, setShuffle] = useState(0);
  const [googleProfiles, setGoogleProfiles] = useState<Record<string, GooglePlannerProfile | null>>({});
  const restoredPlan = useMemo(() => {
    const ids = String(initialPlanIds || '').split(',').filter(Boolean);
    if (ids.length !== 3) return null;
    const restored = ids.map((id) => venues.find((venue) => venue.id === id));
    return restored.every(Boolean) ? (restored as Venue[]) : null;
  }, [initialPlanIds]);
  const plan = useMemo(
    () => restoredPlan ?? getPlan(mode, price, location, shuffle),
    [location, mode, price, restoredPlan, shuffle],
  );
  const config = PLAN_MODES[mode];

  useEffect(() => {
    let active = true;
    const missingIds = plan
      .map((venue) => venue.id)
      .filter((id) => id.startsWith('ChI') && !Object.prototype.hasOwnProperty.call(googleProfiles, id));
    if (!missingIds.length) return undefined;

    void Promise.all(
      missingIds.map(async (id) => {
        try {
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
                  placeholder="Current location or search area"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="search"
                  style={[styles.locationInput, { color: colors.foreground }]}
                  value={location}
                />
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

            <Text style={[styles.filterStatus, { color: colors.mutedForeground }]}>
              {location.trim() || 'Current location'} · Up to {price}
            </Text>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.greeting, { backgroundColor: colors.card, borderLeftColor: colors.goldDeep }]}>
                <PandaLogo size={34} />
                <Text style={[styles.greetingText, { color: colors.foreground }]}>
                  {config.greetings[shuffle % config.greetings.length]}
                </Text>
              </View>

              {plan.map((venue, index) => {
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
                      onOpenDirections(venue, { plan, mode, price, location });
                    }}
                    style={[styles.venueCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.photo}>
                      <VenuePhoto venueId={venue.id} venueName={venue.name} height={88} />
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
                      onOpenVenue(venue, { plan, mode, price, location });
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
                        ↓ {walkBetween(venue, plan[index + 1])} to the next stop
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
                onPress={() => {
                  setOpen(false);
                  onOpenMap(plan, mode);
                }}
                style={[styles.mapButton, { backgroundColor: colors.green800 }]}
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
  filters: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 11 },
  locationField: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, flexDirection: 'row', height: 43, paddingLeft: 10 },
  locationInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, paddingHorizontal: 7, paddingVertical: 0 },
  locateButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 34 },
  priceRow: { flexDirection: 'row', gap: 4 },
  priceButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 39, justifyContent: 'center', width: 32 },
  priceText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  filterStatus: { fontFamily: 'Inter_500Medium', fontSize: 10, marginBottom: 7, marginTop: 5 },
  scrollContent: { paddingBottom: 12 },
  greeting: { alignItems: 'center', borderLeftWidth: 3, borderRadius: 15, flexDirection: 'row', gap: 10, marginBottom: 13, padding: 11 },
  greetingText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
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
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});