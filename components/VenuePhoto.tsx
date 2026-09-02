import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { PANDA_PRODUCTION_API } from '@/constants/services';
import { getVenue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

export type VenuePhotoItem = {
  uri: string;
  attribution: string;
};

export function venuePhotosFor(venueId: string): VenuePhotoItem[] {
  const venue = getVenue(venueId);
  if (!venue) return [];
  return venue.photoAttributions.map((attribution, index) => ({
    uri: `${PANDA_PRODUCTION_API}/api/partner/venues/${encodeURIComponent(venueId)}/photos/${index}/image`,
    attribution,
  }));
}

export function VenuePhoto({
  venueId,
  venueName,
  height,
}: {
  venueId: string;
  venueName: string;
  height: number;
}) {
  const colors = useColors();
  const photo = venuePhotosFor(venueId)[0];

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