import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Venue } from '@/data/venues';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { VenuePhoto } from '@/components/VenuePhoto';
import { ReserveButton } from '@/components/ReserveButton';
import { NonHospitalityCard } from '@/components/NonHospitalityCard';
import { isNonHospitalityVenue } from '@/utils/non-hospitality-actions';
import { venueCardPalette } from '@/constants/venue-card-design';
import { VENUE_PREVIEW_CARD_HEIGHT, VENUE_PREVIEW_PHOTO_HEIGHT } from '@/constants/venue-preview-layout';

type VenueCardProps = {
  venue: Venue;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
  compact?: boolean;
  featured?: boolean;
  activitySurface?: 'banging' | 'discovery';
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
  const compactPreview = compact && editorial;
  if (isNonHospitalityVenue(venue) && !compactPreview) {
    return <NonHospitalityCard venue={venue} saved={saved} onPress={onPress} onToggleSaved={onToggleSaved} compact={compact} activitySurface={activitySurface} />;
  }
  const premiumCard = venue.premium;
  const premiumFeatured = featured && venue.premium;
  const tierLabel = venue.premium
    ? (editorial ? (venue.banging ? 'Premium' : 'Promoted') : 'PANDA PREMIUM')
    : null;
  const premiumBanging = editorial && !!venue.premium;
  const previewRating = Number.parseFloat(venue.rating);

  return (
    <Pressable
      testID={`venue-card-${venue.id}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: premiumBanging ? colors.green900 : editorial ? venueCardPalette.row : premiumCard ? colors.green800 : colors.card,
          borderColor: premiumBanging ? venueCardPalette.gold : editorial ? venueCardPalette.border : premiumCard ? colors.goldLine : featured ? colors.goldLine : colors.border,
        },
        pressed && styles.pressed,
        editorial && styles.editorialCard,
        premiumBanging && styles.premiumBangingCard,
        premiumFeatured && styles.featuredCard,
        compact && styles.compactCard,
        compactPreview && styles.previewCard,
      ]}
    >
      <View style={styles.photo}>
        <VenuePhoto
          venue={venue}
          venueId={venue.id}
          venueName={venue.name}
          height={compactPreview ? VENUE_PREVIEW_PHOTO_HEIGHT : compact ? 100 : premiumFeatured ? 148 : 136}
          transition={compactPreview ? 0 : undefined}
          placeholderMode={compactPreview ? 'clean' : 'initial'}
        />
        {editorial && !compactPreview ? (
          <LinearGradient
            colors={['transparent', 'rgba(20,12,2,0.72)']}
            pointerEvents="none"
            style={styles.editorialShade}
          />
        ) : null}
        {tierLabel ? (
          <View style={[
            styles.premiumBadge,
            premiumBanging && styles.premiumBadgeStrong,
            {
              backgroundColor: premiumBanging ? colors.honey : colors.goldSoft,
              borderColor: premiumBanging ? colors.green950 : colors.goldLine,
            },
          ]}>
            <Text style={[styles.premiumStar, { color: premiumBanging ? colors.green950 : colors.goldDeep }]}>✦</Text>
            <Text style={[
              styles.premiumText,
              premiumBanging && styles.premiumTextStrong,
              { color: premiumBanging ? colors.green950 : colors.honeyInk },
            ]}>{tierLabel}</Text>
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
        {premiumCard && !compactPreview ? (
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
          compactPreview && styles.previewBody,
        ]}
      >
        {compactPreview ? (
          <>
            <View style={styles.previewCopy}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.editorialName,
                  styles.previewName,
                  { color: premiumBanging ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {venue.name}
              </Text>
              {activitySurface === 'banging' && Number.isFinite(previewRating) ? (
                <View style={styles.previewRating} accessibilityLabel={'Rated ' + previewRating.toFixed(1) + ' out of 5'}>
                  <Feather name="star" size={11} color={premiumBanging ? colors.goldLine : colors.goldDeep} />
                  <Text style={[styles.previewRatingText, { color: premiumBanging ? colors.goldLine : colors.goldDeep }]}>{previewRating.toFixed(1)}</Text>
                </View>
              ) : null}
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.previewStatus,
                  { color: premiumBanging
                    ? colors.mint300
                    : venue.source === 'openstreetmap' || venue.cached
                      ? colors.mutedForeground
                      : venue.openNow ? colors.openForeground : colors.closedForeground },
                ]}
              >
                {venue.source === 'openstreetmap'
                  ? 'Hours unverified'
                  : venue.cached ? 'Hours unverified' : venue.openNow ? 'Open' : 'Closed'}
                {(venue.walkingTime || venue.distance) ? ` • ${venue.walkingTime || venue.distance}` : ''}
              </Text>
            </View>
            <ReserveButton
              venue={venue}
              activitySurface={activitySurface}
              tone={premiumCard ? 'soft' : 'solid'}
              style={[styles.compactReserveButton, styles.previewReserveButton]}
            />
          </>
        ) : (
          <>
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
          </>
        )}
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
  previewCard: {
    height: VENUE_PREVIEW_CARD_HEIGHT,
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
  editorialShade: {
    bottom: 0,
    height: 70,
    left: 0,
    position: 'absolute',
    right: 0,
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
  premiumBadgeStrong: {
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
  },
  premiumTextStrong: {
    fontSize: 9,
    letterSpacing: 0.9,
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
  previewBody: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 8,
  },
  previewCopy: {
    gap: 6,
    minWidth: 0,
  },
  previewName: {
    flexShrink: 1,
    minWidth: 0,
  },
  previewRating: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 13 },
  previewRatingText: { fontFamily: 'Inter_700Bold', fontSize: 10, lineHeight: 13 },
  previewStatus: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 15,
  },
  previewReserveButton: {
    alignSelf: 'stretch',
    marginTop: 0,
    minHeight: 38,
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