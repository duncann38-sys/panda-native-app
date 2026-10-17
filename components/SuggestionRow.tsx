import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VenuePhoto } from '@/components/VenuePhoto';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { PANDA_PRODUCTION_API } from '@/constants/services';

let nextProfileRequestAt = 0;

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

async function fetchLiveProfile(placeId: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = Date.now();
    const waitForSlot = Math.max(0, nextProfileRequestAt - now);
    nextProfileRequestAt = Math.max(now, nextProfileRequestAt) + 100;
    if (waitForSlot) await pause(waitForSlot, signal);
    if (signal.aborted) throw new Error('Profile request cancelled');
    const response = await fetch(
      `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(placeId)}/profile`,
      { headers: { Accept: 'application/json' }, signal },
    );
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(5_000, retryAfter * 1_000) : 250 * 2 ** attempt;
      await pause(backoff, signal);
      continue;
    }
    if (!response.ok) throw new Error(`Venue profile request failed: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }
  throw new Error('Venue profile is temporarily unavailable');
}

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
  const [hydratedVenue, setHydratedVenue] = useState<Venue | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);

  useEffect(() => {
    setHydratedVenue(null);
    setProfileFailed(false);
    if (!venue.detailsDeferred || venue.id.startsWith('osm:')) return;
    const controller = new AbortController();
    void fetchLiveProfile(venue.id, controller.signal).then((profile) => {
      if (typeof profile.name !== 'string' || !profile.name.trim()) {
        throw new Error('Google did not return a venue name');
      }
      const photos = Array.isArray(profile.photoNames) ? profile.photoNames.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const photo = item as Record<string, unknown>;
        return typeof photo.name === 'string'
          ? [{ name: photo.name, attribution: typeof photo.attribution === 'string' ? photo.attribution : '' }]
          : [];
      }) : [];
      const display = {
        ...venue,
        name: profile.name,
        fullAddress: typeof profile.address === 'string' ? profile.address : venue.fullAddress,
        type: typeof profile.primaryType === 'string' ? profile.primaryType : venue.type,
        rating: typeof profile.rating === 'number' ? profile.rating.toFixed(1) : venue.rating,
        ratingCount: typeof profile.ratingCount === 'number' ? profile.ratingCount : venue.ratingCount,
        price: typeof profile.price === 'string' ? profile.price : venue.price,
        openNow: typeof profile.openNow === 'boolean' ? profile.openNow : venue.openNow,
        hours: typeof profile.todayHours === 'string' ? profile.todayHours : venue.hours,
        phone: typeof profile.phone === 'string' ? profile.phone : venue.phone,
        website: typeof profile.website === 'string' ? profile.website : venue.website,
        latitude: typeof profile.latitude === 'number' ? profile.latitude : venue.latitude,
        longitude: typeof profile.longitude === 'number' ? profile.longitude : venue.longitude,
        photoNames: photos,
        photoName: photos[0]?.name,
        photoAttributions: photos[0]?.attribution ? [photos[0].attribution] : [],
        photoCount: photos.length,
        detailsDeferred: false,
        cached: false,
      } as Venue;
      setHydratedVenue(display);
    }).catch(() => {
      if (!controller.signal.aborted) setProfileFailed(true);
    });
    return () => controller.abort();
  }, [venue.id, venue.detailsDeferred]);

  const card = hydratedVenue ?? venue;
  const cardTitle = card.detailsDeferred
    ? profileFailed ? 'Live details unavailable' : 'Loading venue…'
    : card.name;

  return (
    <Pressable
      testID={`suggestion-${venue.id}`
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: card.promoted ? colors.ivory : colors.card,
          borderColor: card.promoted ? colors.gold : colors.border,
          shadowColor: card.promoted ? colors.goldDeep : colors.green900,
        },
        card.promoted && styles.promoted,
        pressed && styles.pressed,
      ]}
    >
      {card.promoted ? (
        <>
          <View style={[styles.goldRail, { backgroundColor: colors.gold }]} />
          <View style={[styles.goldGlow, { backgroundColor: colors.honeySoft }]} />
        </>
      ) : null}
      <View style={styles.photo}>
        <VenuePhoto venue={card} venueId={card.id} venueName={cardTitle} height={76} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            {card.promoted ? (
              <View style={[styles.promotedLabel, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                <MaterialCommunityIcons name="star-four-points" size={9} color={colors.goldDeep} />
                <Text style={[styles.promotedLabelText, { color: colors.goldDeep }]}>Promoted</Text>
              </View>
            ) : null}
            <Text numberOfLines={1} style={[styles.name, { color: card.promoted ? colors.green800 : colors.foreground }]}>{cardTitle}</Text>
          </View>
          <Pressable
            testID={`suggestion-save-${venue.id}`
            accessibilityLabel={saved ? `Remove ${cardTitle} from saved venues` : `Save ${cardTitle}`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onToggleSaved}
            style={({ pressed }) => [styles.heart, pressed && styles.iconPressed]}
          >
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={20}
              color={saved ? colors.destructive : card.promoted ? colors.goldDeep : colors.mutedForeground} />
          </Pressable>
        </View>
        {!card.detailsDeferred && <View style={styles.addressRow}>
          <Feather name="map-pin" size={13} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={[styles.address, { color: colors.mutedForeground }]}>{card.fullAddress}</Text>
        </View>}
        {!card.detailsDeferred && <View style={styles.metaRow}>
          <Text style={[styles.open, { color: card.cached ? colors.green700 : card.openNow ? colors.openForeground : colors.closedForeground }]}>
            {card.cached ? 'Saved · check hours' : card.openNow ? 'Open' : 'Closed'}
          </Text>
          <Text style={[styles.meta, { color: colors.foreground }]}>{card.distance}</Text>
          <Text style={[styles.meta, { color: colors.foreground }]}>{card.walkingTime}</Text>
          <Text style={[styles.meta, { color: colors.foreground }]}>{card.price}</Text>
          <Text numberOfLines={1} style={[styles.meta, styles.type, { color: colors.mutedForeground }]}>{card.type}</Text>
        </View>}
        {card.sourceAttribution ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{card.sourceAttribution}</Text> : null}
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