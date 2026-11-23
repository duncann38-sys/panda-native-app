import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Venue } from '@/data/venues';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { VenuePhoto } from '@/components/VenuePhoto';
import { ReserveButton } from '@/components/ReserveButton';
import { NonHospitalityCard } from '@/components/NonHospitalityCard';
import { isNonHospitalityVenue } from '@/utils/non-hospitality-actions';

type VenueCardProps = {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  compact?: boolean;
  featured?: boolean;
  activitySurface?: 'banging';
  presentation?: 'banging';
};

export function VenueCard({
  venue,
  saved,
  onPress,
  onToggleSaved,
  compact = false,
  featured = false,
  activitySurface,
  presentation,
}: VenueCardProps) {
  const colors = useColors();
  const editorial = presentation === 'banging';
  if (isNonHospitalityVenue(venue)) return <NonHospitalityCard venue={venue} saved={saved} onPress={onPress} onToggleSaved={onToggleSaved} compact={compact} activitySurface={activitySurface} />;
  const premiumCard = venue.premium;
  const premiumFeatured = featured && venue.premium;
  const tierLabel = venue.premium
    ? (editorial ? (venue.banging ? 'Premium' : 'Promoted') : 'PANDA PREMIUM')
    : null;
  const premiumBanging = editorial && !!venue.premium;

  return (
    <Pressable
      testID={`venue-card-${venue.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: premiumBanging ? colors.green900 : premiumCard ? colors.green800 : colors.card,
          borderColor: editorial ? premiumBanging ? colors.goldLine : colors.border : premiumCard ? colors.goldLine : featured ? colors.goldLine : colors.border,
        },
        pressed && styles.pressed,
        editorial && styles.editorialCard,
        premiumBanging && styles.premiumBangingCard,
        premiumFeatured && styles.featuredCard,
        compact && styles.compactCard,
      ]}
    >
      <View style={styles.photo}>
        <VenuePhoto
          venue={venue}
          venueId={venue.id}
          venueName={venue.name}
          height={compact ? 100 : premiumFeatured ? 148 : 136}
        />
        {tierLabel ? (
          <View style={[styles.premiumBadge, { backgroundColor: colors.goldSoft, borderColor: colors.goldLine }]}>
            <Text style={[styles.premiumStar, { color: colors.goldDeep }]}>✦</Text>
            <Text style={[styles.premiumText, { color: colors.honeyInk }]}>{tierLabel}</Text>
          </View>
        ) : null}
        <View style={styles.topRow}>
          <Pressable
            testID={`save-${venue.id}`}
            accessibilityLabel={saved ? `Remove ${venue.name} from saved venues` : `Save ${venue.name}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => { recordVenueActivity('save_click', venue, activitySurface); onToggleSaved(); }}
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
            onPress={() => { recordVenueActivity('photo_click', venue, activitySurface); onPress(); }}
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
          editorial && styles.editorialBody,
        ]}
      >
        <Text
          numberOfLines={compact ? 2 : undefined}
          ellipsizeMode="tail"
          style={[
            styles.name,
            compact && styles.compactName,
            editorial && styles.editorialName,
            { color: premiumBanging || (!editorial && premiumCard) ? colors.primaryForeground : colors.foreground },
          ]}
        >
          {venue.name}
        </Text>
        <View style={[styles.metaRow, compact && styles.compactMetaRow]}>
          {venue.rating ? (
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
          ) : null}
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
        <Text style={[styles.openText, { color: venue.source === 'openstreetmap' || venue.cached ? colors.mutedForeground : premiumCard ? colors.mint300 : venue.openNow ? colors.openForeground : colors.closedForeground }]}>
          {venue.source === 'openstreetmap'
            ? 'Hours not listed'
            : venue.cached ? 'Hours unverified' : venue.openNow ? 'Open now' : 'Closed'}
        </Text>
        {venue.sourceAttribution ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }}>
            {venue.sourceAttribution}
          </Text>
        ) : null}
        <ReserveButton
          venue={venue}
          activitySurface={activitySurface}
          tone={premiumCard ? 'soft' : 'solid'}
          style={[styles.reserveButton, compact && styles.compactReserveButton]}
        />
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
  editorialCard: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  premiumBangingCard: {
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#033B2B',
    shadowOpacity: 0.18,
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
  editorialBody: {
    borderTopColor: 'rgba(181,148,86,0.22)',
    borderTopWidth: StyleSheet.hairlineWidth,
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
  editorialName: {
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.25,
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
  reserveButton: {
    alignSelf: 'stretch',
    marginTop: 11,
  },
  compactReserveButton: {
    borderRadius: 11,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  photoActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
  },
});