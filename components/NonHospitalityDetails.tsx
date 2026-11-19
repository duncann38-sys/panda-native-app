import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NonHospitalityCard } from './NonHospitalityCard';
import { useSavedVenues } from '@/context/saved-venues';
import { useColors } from '@/hooks/useColors';
import type { Venue } from '@/data/venues';
export function NonHospitalityDetails({ venue }: { venue: Venue }) {
  const colors = useColors(), router = useRouter(), insets = useSafeAreaInsets();
  const { isSaved, toggleSaved } = useSavedVenues();
  return <View style={{ flex: 1, backgroundColor: colors.ivory, paddingTop: insets.top }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to places" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
      style={{ padding: 20 }}>
      <Text style={{ color: colors.green800, fontFamily: 'Inter_600SemiBold' }}>Back</Text>
    </Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 24 }}>
      <NonHospitalityCard venue={venue} saved={isSaved(venue.id)} onToggleSaved={() => toggleSaved(venue)} onPress={() => {}} />
      {!!venue.fullAddress && <Text selectable style={{ color: colors.foreground, marginTop: 18, lineHeight: 22 }}>{venue.fullAddress}</Text>}
      {!!venue.description && <Text style={{ color: colors.mutedForeground, marginTop: 12, lineHeight: 22 }}>{venue.description}</Text>}
      {venue.category === 'Place of Interest' && <Text style={{ color: colors.mutedForeground, marginTop: 12, lineHeight: 20 }}>
        Use the official website to check admission, opening hours and any ticket requirements. Panda does not issue tickets or confirm purchases.
      </Text>}
    </ScrollView>
  </View>;
}
