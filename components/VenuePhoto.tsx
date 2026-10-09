import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { getVenue, type Venue } from '@/data/venues';
import { useLiveVenues } from '@/context/live-venues';
import { useColors } from '@/hooks/useColors';

export type VenuePhotoItem = {
  uri: string;
  attribution: string;
};

export function venuePhotosFor(value: string | Venue): VenuePhotoItem[] {
  const venue = typeof value === 'string' ? getVenue(value) : value;
  if (!venue) return [];
  if (venue.photoName) {
    return [{
      uri: `${PANDA_PRODUCTION_API}/api/place-photo?name=${encodeURIComponent(venue.photoName)}&max=900`,
      attribution: venue.photoAttributions.join(' · '),
    }];
  }
  return venue.photoAttributions.map((attribution, index) => ({
    uri: `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(venue.id)}/photos/${index}/image`,
    attribution,
  }));
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
  const photo = record ? venuePhotosFor(record)[0] : undefined;

  if (photo) {
    return (
      <Image
        source={{ uri: photo.uri }}
        contentFit="cover"
        transition={250}
        accessibilityLabel={`${venueName} venue photo`}
        style={{ height, width: '100%' }}
      />
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