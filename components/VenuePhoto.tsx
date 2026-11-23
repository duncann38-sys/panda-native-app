import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PANDA_PARTNER_ACTIVITY_API, PANDA_PRODUCTION_API } from '@/constants/services';
import { getVenue } from '@/data/venues';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

export type VenuePhotoItem = {
  uri: string;
  attribution: string;
};

const MAX_VENUE_PHOTOS = 10;

export function venuePhotoLimit(venue: Venue) {
  const knownPhotoCount = Math.max(
    Number.isFinite(venue.photoCount) ? Math.max(0, Math.floor(venue.photoCount!)) : 0,
    venue.photoNames?.length ?? 0,
    venue.photoUris?.length ?? 0,
    venue.photoAttributions.length,
    venue.photoName ? 1 : 0,
    venue.primaryPhotoPath ? 1 : 0,
  );
  return Math.min(MAX_VENUE_PHOTOS, knownPhotoCount);
}

export function venuePhotosFor(venueOrId: Venue | string): VenuePhotoItem[] {
  const venue = typeof venueOrId === 'string' ? getVenue(venueOrId) : venueOrId;
  if (!venue) return [];
  if (venue.source === 'openstreetmap' || venue.id.startsWith('osm:')) return [];
  if (venue.photoUris?.length) return venue.photoUris.slice(0, MAX_VENUE_PHOTOS);
  const venueId = venue.id;
  const count = venuePhotoLimit(venue);
  return Array.from({ length: count }, (_, index) => {
    const photoName = venue.photoNames?.[index]?.name || (index === 0 ? venue.photoName : undefined);
    const storedPath = index === 0 ? venue.primaryPhotoPath : undefined;
    const storedPathUri = storedPath
      ? /^https?:\/\//i.test(storedPath)
        ? storedPath
        : `${PANDA_PARTNER_ACTIVITY_API}${storedPath.startsWith('/') ? '' : '/'}${storedPath}`
      : undefined;
    return {
      uri: storedPathUri
        || (photoName
          ? `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(photoName)}&max=900`
          : `${PANDA_PARTNER_ACTIVITY_API}/api/partner/venues/${encodeURIComponent(venueId)}/photos/${index}/image`),
      attribution: venue.photoNames?.[index]?.attribution
        || venue.photoAttributions[index]
        || venue.photoAttributions[0]
        || venue.name,
    };
  });
}

export function VenuePhoto({
  venueId,
  venueName,
  venue,
  height,
}: {
  venueId: string;
  venueName: string;
  venue?: Venue;
  height: number;
}) {
  const colors = useColors();
  const photo = venuePhotosFor(venue ?? venueId)[0];
  const [failed, setFailed] = useState(false);
  const [retryReady, setRetryReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => setFailed(false), [photo?.uri]);
  useEffect(() => {
    if (!failed) return;
    setRetryReady(false);
    const timer = setTimeout(() => setRetryReady(true), 30_000);
    return () => clearTimeout(timer);
  }, [failed]);

  if (photo) {
    return (
      <View style={[styles.photoShell, { height, backgroundColor: colors.secondary }]}>
        <Image
          key={retryKey}
          onError={() => setFailed(true)}
          source={{ uri: photo.uri }}
          contentFit="cover"
          transition={250}
          accessibilityLabel={`${venueName} venue photo`}
          style={StyleSheet.absoluteFillObject}
        />
        {failed ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${venueName} photo`}
          disabled={!retryReady}
          onPress={() => { setFailed(false); setRetryKey(value => value + 1); }}
          style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.secondary }]}>
          <Text style={{ color: colors.foreground, fontSize: height < 100 ? 10 : 14, textAlign: 'center' }}>{height < 100 ? 'Photo unavailable' : 'Photo temporarily unavailable'}</Text>
          {height >= 100 ? <Text style={{ color: colors.mutedForeground, marginTop: 6 }}>{retryReady ? 'Tap to retry' : 'Please try again shortly'}</Text> : null}
        </Pressable> : null}
      </View>
    );
  }

  return (
    <View style={[styles.fallback, { height, backgroundColor: colors.secondary }]}>
      <Text style={[styles.initial, { color: colors.green700 }]}>{venueName.charAt(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoShell: {
    overflow: 'hidden',
    width: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  initial: {
    fontFamily: 'Inter_700Bold',
    fontSize: 48,
  },
});