import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VenuePhoto } from '@/components/VenuePhoto';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

export function SuggestionRow({
  venue,
  saved,
  onPress,
  onToggleSaved,
}: {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      testID={`suggestion-${venue.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: venue.promoted ? colors.ivory : colors.card,
          borderColor: venue.promoted ? colors.gold : colors.border,
          shadowColor: venue.promoted ? colors.goldDeep : colors.green900,
        },
        venue.promoted && styles.promoted,
        pressed && styles.pressed,
      ]}
    >
      {venue.promoted ? (
        <>
          <View style={[styles.goldRail, { backgroundColor: colors.gold }]} />
          <View style={[styles.goldGlow, { backgroundColor: colors.honeySoft }]} />
        </>
      ) : null}
      <View style={styles.photo}>
        <VenuePhoto venueId={venue.id} venueName={venue.name} height={76} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            {venue.promoted ? (
              <View style={[styles.promotedLabel, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                <MaterialCommunityIcons name="star-four-points" size={9} color={colors.goldDeep} />
                <Text style={[styles.promotedLabelText, { color: colors.goldDeep }]}>PANDA PREMIUM</Text>
              </View>
            ) : null}
            <Text
              numberOfLines={1}
              style={[styles.name, { color: venue.promoted ? colors.green800 : colors.foreground }]}
            >
              {venue.name}
            </Text>
          </View>
          <Pressable
            testID={`suggestion-save-${venue.id}`}
            accessibilityLabel={saved ? `Remove ${venue.name} from saved venues` : `Save ${venue.name}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onToggleSaved}
            style={({ pressed }) => [styles.heart, pressed && styles.iconPressed]}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={20}
              color={saved ? colors.destructive : venue.promoted ? colors.goldDeep : colors.mutedForeground}
            />
          </Pressable>
        </View>
        <View style={styles.addressRow}>
          <Feather name="map-pin" size={13} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={[styles.address, { color: colors.mutedForeground }]}>
            {venue.fullAddress}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.open, { color: venue.openNow ? colors.openForeground : colors.closedForeground }]}>
            {venue.openNow ? 'Open' : 'Closed'}
          </Text>
          <Text style={[styles.meta, { color: colors.foreground }]}>{venue.distance}</Text>
          <Text style={[styles.meta, { color: colors.foreground }]}>{venue.walkingTime}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{venue.price}</Text>
          <Text numberOfLines={1} style={[styles.meta, styles.type, { color: colors.mutedForeground }]}>
            {venue.type}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 9,
    minHeight: 100,
    overflow: 'hidden',
    padding: 8,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 11,
  },
  promoted: {
    borderWidth: 2,
    elevation: 5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.19,
    shadowRadius: 13,
  },
  photo: {
    borderWidth: 0,
    borderRadius: 14,
    height: 80,
    overflow: 'hidden',
    width: 82,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  name: {
    flex: 1,
    fontFamily: 'serif',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.25,
  },
  promotedLabel: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginTop: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  promotedLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 7,
    letterSpacing: 0.65,
  },
  heart: {
    alignItems: 'center',
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  addressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 3,
  },
  address: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 5,
    minWidth: 0,
  },
  open: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  type: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  iconPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.9 }],
  },
  goldRail: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5,
  },
  goldGlow: {
    borderRadius: 999,
    height: 110,
    opacity: 0.38,
    position: 'absolute',
    right: -52,
    top: -55,
    width: 110,
  },
});