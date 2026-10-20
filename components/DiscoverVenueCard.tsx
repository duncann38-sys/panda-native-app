import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { VenuePhoto } from '@/components/VenuePhoto';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { useVenueCardDesign } from '@/hooks/useVenueCardDesign';

export function DiscoverVenueCard({
  venue,
  saved,
  onPress,
  onToggleSaved,
  warning,
}: {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  warning?: string | null;
}) {
  const colors = useColors();
  const { cardColors, fonts } = useVenueCardDesign();
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const setPressed = (pressed: boolean) => {
    scale.value = withSpring(pressed ? 0.985 : 1, {
      damping: 22, stiffness: 320, reduceMotion: ReduceMotion.System,
    });
  };
  const cardMeta = [
    venue.type && venue.type !== 'Venue' ? venue.type : undefined,
    venue.walkingTime,
  ].filter(Boolean).join(' · ');
  const photoCredit = venue.photoAttributions[0]?.trim();
  const rating = Number(venue.rating);
  const hasRating = Number.isFinite(rating) && rating > 0 && rating <= 5;

  return (
    <Animated.View style={[
      styles.row, motion,
      {
        backgroundColor: venue.promoted ? cardColors.premiumSurface : cardColors.row,
        borderColor: venue.promoted ? cardColors.gold : cardColors.border,
        shadowColor: venue.promoted ? cardColors.goldInk : cardColors.ink,
      },
      venue.promoted && styles.promoted,
    ]}>
      {venue.promoted && <View pointerEvents="none" style={[styles.goldRail, { backgroundColor: cardColors.gold }]} />}
      <Pressable
        testID={`suggestion-${venue.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Open ${venue.name}${cardMeta ? `, ${cardMeta}` : ''}`}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={styles.open}
      >
        <View style={styles.photo}>
          <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={86} />
          {photoCredit ? (
            <View pointerEvents="none" style={[styles.photoCredit, { backgroundColor: cardColors.photoCreditBackground }]}>
              <Text numberOfLines={1} style={[styles.photoCreditText, { color: cardColors.photoCreditForeground, fontFamily: fonts.medium }]}>{photoCredit}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.copy}>
          {venue.promoted && (
            <View style={[styles.promotedLabel, { backgroundColor: cardColors.goldSoft, borderColor: cardColors.gold }]}>
              <Text style={[styles.promotedLabelText, { color: cardColors.goldInk, fontFamily: fonts.bold }]}>PANDA PREMIUM</Text>
            </View>
          )}
          <Text numberOfLines={2} style={[styles.name, { color: cardColors.ink, fontFamily: fonts.bold }]}>{venue.name}</Text>
          {cardMeta ? <Text numberOfLines={1} style={[styles.meta, { color: cardColors.muted, fontFamily: fonts.medium }]}>{cardMeta}</Text> : null}
          {warning ? <Text numberOfLines={2} style={[styles.meta, { color: cardColors.muted, fontFamily: fonts.medium }]}>{warning}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.rail}>
        {hasRating ? (
          <View accessibilityLabel={`Rated ${venue.rating} out of 5`} style={[styles.rating, { backgroundColor: cardColors.goldSoft }]}>
            <Svg width={11} height={11} viewBox="0 0 24 24" fill={cardColors.goldInk}>
              <Path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
            </Svg>
            <Text style={[styles.ratingText, { color: cardColors.goldInk, fontFamily: fonts.bold }]}>{venue.rating}</Text>
          </View>
        ) : <View />}
        <Pressable
          testID={`suggestion-save-${venue.id}`}
          accessibilityLabel={saved ? `Remove ${venue.name} from saved venues` : `Save ${venue.name}`}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          onPress={onToggleSaved}
          style={({ pressed }) => [
            styles.heart,
            {
              backgroundColor: saved ? cardColors.savedSurface : cardColors.surface,
              borderColor: saved ? cardColors.gold : cardColors.rule,
            },
            pressed && styles.iconPressed,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
              fill={saved ? colors.destructive : 'none'}
              stroke={saved ? colors.destructive : cardColors.muted}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 9,
    minHeight: 104,
    overflow: 'hidden',
    padding: 8,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  promoted: { shadowOpacity: 0.1, elevation: 2 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  photo: { borderRadius: 15, height: 86, overflow: 'hidden', width: 80 },
  photoCredit: { borderRadius: 4, bottom: 4, left: 4, maxWidth: 62, paddingHorizontal: 4, paddingVertical: 2, position: 'absolute' },
  photoCreditText: { fontSize: 7 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 17.5, lineHeight: 24, fontWeight: '700', letterSpacing: -0.35, includeFontPadding: true },
  promotedLabel: { alignSelf: 'flex-start', borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, marginBottom: 5, paddingHorizontal: 7, paddingVertical: 3 },
  promotedLabelText: { fontSize: 8, letterSpacing: 1 },
  meta: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  rail: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', minWidth: 44 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 4 },
  ratingText: { fontSize: 11 },
  heart: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  goldRail: { bottom: 17, left: 0, position: 'absolute', top: 17, width: 3, borderRadius: 2 },
});
