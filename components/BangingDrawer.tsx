import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

const DRAWER_OPEN_HEIGHT = 270;
const DRAWER_CLOSED_HEIGHT = 48;
const DRAWER_CLOSED_OFFSET = DRAWER_OPEN_HEIGHT - DRAWER_CLOSED_HEIGHT;

export function BangingDrawer({
  venues,
  isSaved,
  onToggleSaved,
  onPress,
}: {
  venues: Venue[];
  isSaved: (id: string) => boolean;
  onToggleSaved: (venue: Venue) => void;
  onPress: (venue: Venue) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : 0;
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const translateY = useRef(new Animated.Value(DRAWER_CLOSED_OFFSET)).current;
  const settledOffset = useRef(DRAWER_CLOSED_OFFSET);
  const gestureStartOffset = useRef(DRAWER_CLOSED_OFFSET);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalVenues = venues.filter((venue) => venue.banging && !venue.premium);
  const premiumVenues = venues.filter((venue) => venue.banging && venue.premium);
  const bangingVenues = normalVenues.reduce<Venue[]>((ordered, venue, index) => {
    ordered.push(venue);
    const nextPosition = index + 1;
    if (nextPosition % 4 === 0 && premiumVenues[nextPosition / 4 - 1]) {
      ordered.push(premiumVenues[nextPosition / 4 - 1]);
    }
    return ordered;
  }, []);
  premiumVenues.slice(Math.ceil(normalVenues.length / 4)).forEach((venue) => bangingVenues.push(venue));
  const cardWidth = Math.min(194, Math.max(174, width - 156));
  const cardGap = 10;
  const sidePadding = 16;
  const drawerSurface = '#FFFBF1';

  const settleDrawer = useCallback(
    (nextOpen: boolean) => {
      const nextOffset = nextOpen ? 0 : DRAWER_CLOSED_OFFSET;
      settledOffset.current = nextOffset;
      setOpen(nextOpen);
      Animated.spring(translateY, {
        damping: 22,
        mass: 0.8,
        stiffness: 230,
        toValue: nextOffset,
        useNativeDriver: true,
      }).start();
    },
    [translateY],
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
            Math.min(DRAWER_CLOSED_OFFSET, gestureStartOffset.current + gestureState.dy),
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
                : projectedOffset < DRAWER_CLOSED_OFFSET / 2;
          settleDrawer(nextOpen);
        },
        onPanResponderTerminate: () => {
          settleDrawer(settledOffset.current === 0);
        },
      }),
    [settleDrawer, translateY],
  );

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + cardGap));
    setActiveIndex(Math.max(0, Math.min(next, bangingVenues.length - 1)));
  };

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          bottom: 78 + (Platform.OS === 'ios' ? insets.bottom : androidBottomInset),
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
              {bangingVenues.length} curated spots
            </Text>
          </View>
          <Feather name={open ? 'chevron-down' : 'chevron-up'} size={open ? 22 : 18} color={colors.goldDeep} />
        </View>
      </Pressable>
      <View style={styles.carouselViewport}>
        <FlatList
          data={bangingVenues}
          horizontal
          decelerationRate="fast"
          keyExtractor={(venue) => venue.id}
          snapToInterval={cardWidth + cardGap}
          snapToAlignment="start"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.cards, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          initialNumToRender={4}
          maxToRenderPerBatch={5}
          windowSize={5}
          renderItem={({ item: venue, index }) => (
            <View style={[styles.cardSlot, { marginRight: cardGap, width: cardWidth }]}>
              <VenueCard
                venue={venue}
                saved={isSaved(venue.id)}
                onToggleSaved={() => onToggleSaved(venue)}
                onPress={() => onPress(venue)}
                compact
                featured={index === activeIndex}
              />
            </View>
          )}
        />
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
    height: DRAWER_OPEN_HEIGHT,
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
    fontSize: 19,
    letterSpacing: -0.3,
  },
  closedTitle: {
    fontSize: 17,
  },
  liveDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  spotCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  closedSpotCount: {
    fontSize: 8,
  },
  cards: {
    paddingBottom: 14,
  },
  carouselViewport: {
    height: 208,
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
});