import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { VenuePhoto } from '@/components/VenuePhoto';
import { ReserveButton } from '@/components/ReserveButton';
import { NonHospitalityCard } from '@/components/NonHospitalityCard';
import { isNonHospitalityVenue } from '@/utils/non-hospitality-actions';
import type { Venue } from '@/data/venues';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { useColors } from '@/hooks/useColors';
import { useVenueCardDesign } from '@/hooks/useVenueCardDesign';

export function SuggestionRow({
  venue,
  saved,
  onPress,
  onToggleSaved,
  activitySurface = 'discovery',
  onPlan,
  onShare,
}: {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  activitySurface?: 'discovery' | 'saved';
  onPlan?: () => void;
  onShare?: () => void;
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
  if (isNonHospitalityVenue(venue)) return <NonHospitalityCard venue={venue} saved={saved} onPress={onPress} onToggleSaved={onToggleSaved} activitySurface={activitySurface} />;

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
          <VenuePhoto venue={venue} venueId={venue.id} venueName={venue.name} height={74} />
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
          <Text numberOfLines={2} style={[styles.name, { color: cardColors.ink, fontFamily: fonts.display }]}>{venue.name}</Text>
          {cardMeta ? <Text numberOfLines={1} style={[styles.meta, { color: cardColors.muted, fontFamily: fonts.medium }]}>{cardMeta}</Text> : null}
          <ReserveButton venue={venue} activitySurface={activitySurface} compact style={styles.reserve} />
          {onPlan || onShare ? (
            <View style={styles.cardActions}>
              {onPlan ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Plan a table at ${venue.name}`} onPress={onPlan} style={[styles.cardAction, { backgroundColor: cardColors.goldSoft }]}>
                  <Ionicons name="calendar-outline" size={13} color={cardColors.goldInk} />
                  <Text style={[styles.cardActionText, { color: cardColors.goldInk, fontFamily: fonts.bold }]}>Plan</Text>
                </Pressable>
              ) : null}
              {onShare ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Share ${venue.name} with friends`} onPress={onShare} style={[styles.cardAction, { backgroundColor: cardColors.soft }]}>
                  <Ionicons name="paper-plane-outline" size={13} color={cardColors.ink} />
                  <Text style={[styles.cardActionText, { color: cardColors.ink, fontFamily: fonts.bold }]}>Share</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.rail}>
        {hasRating ? (
          <View accessibilityLabel={`Rated ${venue.rating} out of 5`} style={styles.rating}>
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
          onPress={() => { recordVenueActivity('save_click', venue, activitySurface); onToggleSaved(); }}
          style={({ pressed }) => [
            styles.heart,
            { backgroundColor: saved ? cardColors.savedSurface : 'transparent' },
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
    borderRadius: 15,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    minHeight: 90,
    overflow: 'hidden',
    padding: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  promoted: { shadowOpacity: 0.11, elevation: 3 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  photo: { borderRadius: 11, height: 74, overflow: 'hidden', width: 70 },
  photoCredit: { borderRadius: 4, bottom: 4, left: 4, maxWidth: 62, paddingHorizontal: 4, paddingVertical: 2, position: 'absolute' },
  photoCreditText: { fontSize: 7 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', lineHeight: 18, letterSpacing: -0.25 },
  promotedLabel: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, marginBottom: 4, paddingHorizontal: 6, paddingVertical: 2 },
  promotedLabelText: { fontSize: 7, letterSpacing: 0.65 },
  meta: { fontSize: 10, marginTop: 5 },
  reserve: { alignSelf: 'flex-start', marginTop: 7 },
  cardActions: { flexDirection: 'row', gap: 7, marginTop: 6 },
  cardAction: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 28, minWidth: 64, paddingHorizontal: 9 },
  cardActionText: { fontSize: 9 },
  rail: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', minWidth: 44 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 2 },
  ratingText: { fontSize: 10 },
  heart: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44, borderRadius: 22 },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  goldRail: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 3 },
});
