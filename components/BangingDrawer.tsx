import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bangingDrawerLayout } from '@/utils/banging-drawer-layout';
import {
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VenueCard } from '@/components/VenueCard';
import {
  VENUE_PREVIEW_CARD_GAP,
  VENUE_PREVIEW_CARD_HEIGHT,
  VENUE_PREVIEW_SIDE_PADDING,
  venuePreviewCardWidth,
} from '@/constants/venue-preview-layout';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { useVenueImpressions } from '@/hooks/useVenueImpressions';
import { useVenueResultAppearances } from '@/hooks/useVenueResultAppearances';
import { normalizeBangingVenueList } from '@/utils/discovery-data-safety';
import { withVenueActivityContext } from '@/utils/record-venue-activity';

export function BangingDrawer({
  venues,
  isSaved,
  onToggleSaved,
  onPress,
  onOpenChange,
  status,
}: {
  venues: Venue[];
  status?: string;
  isSaved: (id: string) => boolean;
  onToggleSaved: (venue: Venue) => void;
  onPress: (venue: Venue) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : 0;
  const { width, fontScale } = useWindowDimensions();
  const measurementKey = `${width}:${fontScale}`;
  const [measurements, setMeasurements] = useState({ key: measurementKey, header: 64 });
  const measuredHeader = measurements.key === measurementKey ? measurements.header : 64;
  const geometry = bangingDrawerLayout(measuredHeader, VENUE_PREVIEW_CARD_HEIGHT, 48);
  const closedOffset = geometry.closedOffset;
  const [open, setOpen] = useState(false);
  const bangingImpressions = useVenueImpressions('banging', open);
  const bangingViewabilityPairs = useRef([bangingImpressions.presentationPair, bangingImpressions]).current;
  const translateY = useRef(new Animated.Value(closedOffset)).current;
  const settledOffset = useRef(closedOffset);
  const gestureStartOffset = useRef(closedOffset);
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    const target = openRef.current ? 0 : closedOffset;
    translateY.setValue(target);
    settledOffset.current = target;
    gestureStartOffset.current = target;
  }, [closedOffset, translateY]);
  const measureHeader = (height: number) => {
    const next = Math.ceil(height);
    if (!Number.isFinite(next) || next <= 0) return;
    setMeasurements(previous => {
      const current = previous.key === measurementKey ? previous : { key: measurementKey, header: 64 };
      return current.header === next && previous.key === measurementKey
        ? previous
        : { ...current, header: next };
    });
  };
  // Selection and paid-card spacing are owned by discovery, as in the working APK 90 feed.
  const bangingVenues = useMemo(() => normalizeBangingVenueList(venues), [venues]);
  useVenueResultAppearances(bangingVenues, 'banging', open, 'banging');
  const cardWidth = venuePreviewCardWidth(width);
  const cardGap = VENUE_PREVIEW_CARD_GAP;
  const sidePadding = VENUE_PREVIEW_SIDE_PADDING;
  const drawerSurface = '#FFFBF1';

  const settleDrawer = useCallback(
    (nextOpen: boolean) => {
      const nextOffset = nextOpen ? 0 : closedOffset;
      settledOffset.current = nextOffset;
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
      Animated.spring(translateY, {
        damping: 22,
        mass: 0.8,
        stiffness: 230,
        toValue: nextOffset,
        useNativeDriver: true,
      }).start();
    },
    [translateY, onOpenChange, closedOffset],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            gestureStartOffset.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextOffset = Math.max(
            0,
            Math.min(closedOffset, gestureStartOffset.current + gestureState.dy),
          );
          translateY.setValue(nextOffset);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projectedOffset = gestureStartOffset.current + gestureState.dy;
          const nextOpen =
            gestureState.dy < -36 || gestureState.vy < -0.5
              ? true
              : gestureState.dy > 36 || gestureState.vy > 0.5
                ? false
                : projectedOffset < closedOffset / 2;
          settleDrawer(nextOpen);
        },
        onPanResponderTerminate: () => {
          settleDrawer(settledOffset.current === 0);
        },
      }),
    [settleDrawer, translateY, closedOffset],
  );

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          bottom: 78 + (Platform.OS === 'ios' ? insets.bottom : androidBottomInset),
          height: geometry.height,
          backgroundColor: drawerSurface,
          borderColor: colors.goldLine,
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
          transform: [{ translateY }],
        },
        !open && styles.closed,
      ]}
    >
      <Pressable
        onLayout={event => { if (open) measureHeader(event.nativeEvent.layout.height); }}
        accessibilityLabel={open ? 'Collapse Banging venues' : 'Expand Banging venues'}
        accessibilityHint="Swipe up to open or down to close"
        accessibilityRole="button"
        {...panResponder.panHandlers}
        onPress={() => settleDrawer(!open)}
        style={[styles.handle, open && styles.openHandle, !open && styles.closedHandle]}
      >
        <View
          style={[
            styles.grip,
            open && styles.openGrip,
            !open && styles.closedGrip,
            { backgroundColor: colors.goldLine },
          ]}
        />
        <View style={styles.headingRow}>
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, !open && styles.closedTitle, { color: colors.foreground }]}>Banging</Text>
              <MaterialCommunityIcons name="fire" size={open ? 19 : 15} color={colors.honey} />
              <View style={[styles.liveDot, { backgroundColor: colors.gold }]} />
            </View>
            <Text style={[styles.spotCount, !open && styles.closedSpotCount, { color: colors.goldDeep }]}>
              {bangingVenues.length ? `${bangingVenues.length} curated spots` : status || 'No verified spots yet'}
            </Text>
          </View>
          <Feather name={open ? 'chevron-down' : 'chevron-up'} size={open ? 22 : 18} color={colors.goldDeep} />
        </View>
      </Pressable>
      <View style={[styles.carouselViewport, { height: geometry.carouselHeight }]}>
        {bangingVenues.length ? <FlatList
          viewabilityConfigCallbackPairs={bangingViewabilityPairs}
          data={bangingVenues}
          horizontal
          decelerationRate="fast"
          keyExtractor={(venue) => venue.id}
          snapToInterval={cardWidth + cardGap}
          snapToAlignment="start"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.cards, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          initialNumToRender={4}
          maxToRenderPerBatch={5}
          windowSize={5}
          renderItem={({ item: venue }) => (
            <View style={[styles.cardSlot, { alignSelf: 'flex-start', marginRight: cardGap, width: cardWidth }]}>
              <VenueCard
                activitySurface="banging"
                venue={venue}
                saved={isSaved(venue.id)}
                onToggleSaved={() => onToggleSaved(venue)}
                onPress={() => onPress(withVenueActivityContext(venue, 'banging'))}
                compact
                presentation="banging"
              />
            </View>
          )}
        /> : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
              {status || 'Verified Banging picks will appear here when available.'}
            </Text>
          </View>
        )}
        <LinearGradient
          colors={[drawerSurface, 'transparent']}
          pointerEvents="none"
          style={[styles.frostedEdge, styles.frostedEdgeLeft]}
        />
        <LinearGradient
          colors={['transparent', drawerSurface]}
          pointerEvents="none"
          style={[styles.frostedEdge, styles.frostedEdgeRight]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    elevation: 15,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.17,
    shadowRadius: 18,
    zIndex: 20,
  },
  closed: {
  },
  closedHandle: {
    paddingBottom: 5,
    paddingTop: 5,
  },
  openHandle: {
    paddingBottom: 7,
    paddingTop: 7,
  },
  handle: {
    paddingHorizontal: 19,
    paddingTop: 9,
    paddingBottom: 10,
  },
  grip: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 5,
    marginBottom: 8,
    width: 42,
  },
  closedGrip: {
    height: 4,
    marginBottom: 4,
  },
  openGrip: {
    marginBottom: 6,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  titleBlock: {
    gap: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.65,
  },
  closedTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  liveDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  spotCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  closedSpotCount: {
    fontSize: 8,
  },
  cards: {
    paddingBottom: 0,
  },
  carouselViewport: {
    position: 'relative',
  },
  frostedEdge: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 30,
    zIndex: 5,
  },
  frostedEdgeLeft: {
    left: 0,
  },
  frostedEdgeRight: {
    right: 0,
  },
  cardSlot: {
    paddingVertical: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 86,
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});