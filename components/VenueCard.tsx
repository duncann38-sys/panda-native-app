import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Venue } from '@/data/venues';
import { VenuePhoto } from '@/components/VenuePhoto';

type VenueCardProps = {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  compact?: boolean;
  featured?: boolean;
};

export function VenueCard({
  venue,
  saved,
  onPress,
  onToggleSaved,
  compact = false,
  featured = false,
}: VenueCardProps) {
  const colors = useColors();
  const premiumCard = venue.premium;
  const premiumFeatured = featured && venue.premium;

  return (
    <Pressable
      testID={`venue-card-${venue.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: premiumCard ? colors.green800 : colors.card,
          borderColor: premiumCard ? colors.goldLine : featured ? colors.goldLine : colors.border,
        },
        pressed && styles.pressed,
        premiumFeatured && styles.featuredCard,
        compact && styles.compactCard,
      ]}
    >
      <View style={styles.photo}>
        <VenuePhoto
          venueId={venue.id}
          venueName={venue.name}
          height={compact ? 100 : premiumFeatured ? 148 : 136}
        />
        {venue.premium ? (
          <View style={[styles.premiumBadge, { backgroundColor: colors.goldSoft, borderColor: colors.goldLine }]}>
            <Text style={[styles.premiumStar, { color: colors.goldDeep }]}>✦</Text>
            <Text style={[styles.premiumText, { color: colors.honeyInk }]}>PANDA PREMIUM</Text>
          </View>
        ) : null}
        <View style={styles.topRow}>
          <Pressable
            testID={`save-${venue.id}`}
            accessibilityLabel={saved ? `Remove ${venue.name} from saved venues` : `Save ${venue.name}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onToggleSaved}
            style={({ pressed }) => [styles.heartButton, pressed && styles.iconPressed]}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={21}
              color={saved ? colors.destructive : colors.honey}
            />
          </Pressable>
        </View>
        {premiumCard ? (
          <Pressable
            testID={`view-photos-${venue.id}`}
            accessibilityLabel={`View albums of ${venue.name}`}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
              styles.photoAction,
              { backgroundColor: colors.photoOverlay },
              pressed && styles.iconPressed,
            ]}
          >
            <Feather name="image" size={13} color={colors.primaryForeground} />
            <Text style={[styles.photoActionText, { color: colors.primaryForeground }]}>View Albums</Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={[
          styles.body,
          compact && styles.compactBody,
          premiumFeatured && styles.featuredBody,
          compact && premiumFeatured && styles.compactFeaturedBody,
        ]}
      >
        <Text
          numberOfLines={compact ? 1 : undefined}
          ellipsizeMode="tail"
          style={[
            styles.name,
            compact && styles.compactName,
            { color: premiumCard ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {venue.name}
        </Text>
        <View style={[styles.metaRow, compact && styles.compactMetaRow]}>
          <View style={[styles.metaItem, compact && styles.compactMetaItem]}>
            <Ionicons name="star" size={compact ? 12 : 14} color={colors.honey} />
            <Text
              style={[
                styles.metaText,
                compact && styles.compactMetaText,
                { color: premiumCard ? colors.primaryForeground : colors.foreground },
              ]}
            >
              {venue.rating}
            </Text>
          </View>
          {venue.price ? (
            <>
              <Text style={[styles.dot, compact && styles.compactDot, { color: premiumCard ? colors.mint300 : colors.mutedForeground }]}>·</Text>
              <Text
                style={[
                  styles.metaText,
                  compact && styles.compactMetaText,
                  { color: premiumCard ? colors.mint300 : colors.mutedForeground },
                ]}
              >
                {venue.price}
              </Text>
            </>
          ) : null}
          <Text style={[styles.dot, compact && styles.compactDot, { color: premiumCard ? colors.mint300 : colors.mutedForeground }]}>·</Text>
          <Text
            style={[
              styles.metaText,
              compact && styles.compactMetaText,
              { color: premiumCard ? colors.mint300 : colors.mutedForeground },
            ]}
          >
            {venue.walkingTime}
          </Text>
        </View>
        <Text style={[styles.openText, { color: premiumCard ? colors.mint300 : venue.openNow ? colors.openForeground : colors.closedForeground }]}>
          {venue.openNow ? 'Open now' : 'Closed'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
    width: '100%',
  },
  featuredCard: {
    minWidth: 0,
    borderWidth: 2,
    elevation: 8,
    shadowOpacity: 0.24,
  },
  compactCard: {
    borderRadius: 18,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  topRow: {
    position: 'absolute',
    right: 10,
    top: 9,
    zIndex: 12,
  },
  heartButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.9 }],
  },
  photo: {
    overflow: 'hidden',
    position: 'relative',
  },
  premiumBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    left: 11,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    top: 10,
    zIndex: 12,
  },
  premiumStar: {
    fontSize: 10,
  },
  premiumText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 1.05,
  },
  body: {
    minHeight: 98,
    padding: 13,
  },
  compactBody: {
    minHeight: 84,
    padding: 9,
  },
  featuredBody: {
    minHeight: 106,
    paddingBottom: 15,
  },
  compactFeaturedBody: {
    minHeight: 84,
    paddingBottom: 10,
  },
  name: {
    fontFamily: 'serif',
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: -0.45,
    lineHeight: 22,
  },
  compactName: {
    fontSize: 15.5,
    lineHeight: 19,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  compactMetaRow: {
    gap: 3,
    flexWrap: 'nowrap',
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  compactMetaItem: {
    gap: 3,
  },
  metaText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  compactMetaText: {
    fontSize: 10,
  },
  dot: {
    fontSize: 14,
  },
  compactDot: {
    fontSize: 11,
  },
  openText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 7,
  },
  photoAction: {
    alignItems: 'center',
    borderRadius: 7,
    bottom: 9,
    elevation: 6,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 26,
    minWidth: 82,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 9,
    zIndex: 20,
  },
  photoActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
  },
});