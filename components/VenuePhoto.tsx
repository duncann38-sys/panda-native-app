import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { getVenue, type Venue } from '@/data/venues';
import { useLiveVenues } from '@/context/live-venues';
import { useColors } from '@/hooks/useColors';

export type VenuePhotoItem = {
  uri: string;
  attribution: string;
};

const photoLists = new Map<string, { expires: number; photos: VenuePhotoItem[] }>();
const pendingPhotos = new Map<string, Promise<VenuePhotoItem[]>>();

export function useVenuePhotos(venue?: Venue | null) {
  const limit = venue?.promoted || venue?.banging || venue?.premium ? 10 : 5;
  const [loaded, setLoaded] = useState<{ id: string; photos: VenuePhotoItem[] } | null>(null);
  useEffect(() => {
    if (!venue?.id) return;
    if (venue.photoNames?.length && venue.photoNames.length >= Math.min(limit, venue.photoCount || limit)) {
      setLoaded(null);
      return;
    }
    let active = true;
    const id = venue.id;
    const cached = photoLists.get(id);
    if (cached && cached.expires > Date.now()) {
      setLoaded({ id, photos: cached.photos });
      return;
    }
    let request = pendingPhotos.get(id);
    if (!request) {
      request = fetch(`${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(id)}/photos`)
        .then(async response => {
          if (!response.ok) throw new Error('Venue gallery unavailable');
          const body = await response.json() as { photos?: Array<{ path: string; attribution: string }> };
          const photos = (body.photos ?? []).filter(photo =>
            photo.path.startsWith(`/api/partner/venues/${encodeURIComponent(id)}/photos/`),
          ).map(photo => ({ uri: PANDA_PRODUCTION_API + photo.path, attribution: photo.attribution }));
          photoLists.set(id, { expires: Date.now() + 3 * 60 * 60 * 1000, photos });
          return photos;
        }).finally(() => pendingPhotos.delete(id));
      pendingPhotos.set(id, request);
    }
    request.then(photos => { if (active) setLoaded({ id, photos }); }).catch(() => {});
    return () => { active = false; };
  }, [venue?.id, venue?.photoNames, venue?.photoCount, limit]);
  const initial = venue ? venuePhotosFor(venue) : [];
  const candidates = loaded && loaded.id === venue?.id && loaded.photos.length ? loaded.photos : initial;
  return [...new Map(candidates.map(photo => [photo.uri, photo])).values()].slice(0, limit);
}

export function venuePhotosFor(value: string | Venue): VenuePhotoItem[] {
  const id = typeof value === 'string' ? value : value.id;
  const cached = photoLists.get(id);
  if (cached && cached.expires > Date.now()) return cached.photos;
  const venue = typeof value === 'string' ? getVenue(value) : value;
  if (!venue) return [];
  if (venue.photoNames?.length) {
    return venue.photoNames.map(photo => ({
      uri: `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(photo.name)}&max=900`,
      attribution: photo.attribution,
    }));
  }
  if (venue.photoName) {
    return [{
      uri: `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(venue.photoName)}&max=900`,
      attribution: venue.photoAttributions.join(' · '),
    }];
  }
  return venue.photoAttributions.length ? [{
    uri: `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(venue.id)}/photos/0/image`,
    attribution: venue.photoAttributions[0],
  }] : [];
}

export function VenuePhoto({
  venue,
  venueId,
  venueName,
  height,
}: {
  venue?: Venue;
  venueId: string;
  venueName: string;
  height: number;
}) {
  const colors = useColors();
  const { liveVenues } = useLiveVenues();
  const record = venue ?? liveVenues.find((item) => item.id === venueId) ?? getVenue(venueId);
  const photos = useVenuePhotos(record);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [venueId]);
  const photo = photos[Math.min(page, photos.length - 1)] ?? photos[0];

  if (photo) {
    return (
      <View style={{ height, width: '100%' }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))}>
          {photos.map((item, index) => (
            <View key={item.uri} style={{ height, width: width || 1 }}>
              {Math.abs(index - page) <= 1 ? <Image source={{ uri: item.uri }} contentFit="cover"
                transition={250} accessibilityLabel={`${venueName} photo ${index + 1} of ${photos.length}`}
                style={{ height, width: '100%' }} /> : null}
            </View>
          ))}
        </ScrollView>
        {photos.length > 1 ? <Text style={{ position: 'absolute', right: 5, bottom: 5,
          color: '#fff', backgroundColor: '#0009', borderRadius: 8, paddingHorizontal: 5, fontSize: 10 }}>
          {Math.min(page + 1, photos.length)}/{photos.length}
        </Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.fallback, { height, backgroundColor: colors.green700 }]}>
      <Text style={[styles.initial, { color: colors.primaryForeground }]}>{venueName.charAt(0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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