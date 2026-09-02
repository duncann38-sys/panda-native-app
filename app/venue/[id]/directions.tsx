import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { getVenue } from '@/data/venues';
import { PandaIcon } from '@/components/PandaIcon';
import { useColors } from '@/hooks/useColors';

export default function VenueDirectionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = getVenue(id ?? '');

  if (!venue) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Venue unavailable</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to Panda Home"
          onPress={() => router.replace('/')}
          style={[styles.notFoundButton, { backgroundColor: colors.green800 }]}
        >
          <Text style={[styles.notFoundButtonText, { color: colors.primaryForeground }]}>Back to Panda</Text>
        </Pressable>
      </View>
    );
  }

  const encodedAddress = encodeURIComponent(venue.fullAddress);
  const webMapQuery = `https://www.google.com/maps?q=${encodedAddress}&z=16&output=embed`;
  const nativeMapQuery = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  const goBackToVenue = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(`/venue/${venue.id}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      {Platform.OS === 'web'
        ? createElement('iframe', {
            title: `Map showing directions to ${venue.name}`,
            src: webMapQuery,
            loading: 'eager',
            referrerPolicy: 'no-referrer-when-downgrade',
            style: {
              border: 0,
              height: '100%',
              left: 0,
              position: 'absolute',
              top: 0,
              width: '100%',
            },
          })
        : (
          <WebView
            source={{ uri: nativeMapQuery }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            style={StyleSheet.absoluteFill}
          />
        )}

      <View style={[styles.header, { paddingTop: Math.max(14, insets.top + 8) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${venue.name}`}
          onPress={goBackToVenue}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon name="arrow-left" size={18} color={colors.green800} />
          <Text style={[styles.backButtonText, { color: colors.green800 }]}>Back</Text>
        </Pressable>
        <View style={[styles.headerTitle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.headerEyebrow, { color: colors.green700 }]}>PANDA DIRECTIONS</Text>
          <Text numberOfLines={1} style={[styles.headerName, { color: colors.foreground }]}>
            {venue.name}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.routeCard,
          {
            backgroundColor: colors.ivory,
            borderColor: colors.goldLine,
            paddingBottom: Math.max(20, insets.bottom + 18),
          },
        ]}
      >
        <View style={styles.routeCardHandle}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.routeEyebrowRow}>
          <View style={[styles.routeIcon, { backgroundColor: colors.green700 }]}>
            <PandaIcon name="navigate" size={17} color={colors.primaryForeground} />
          </View>
          <View style={styles.routeTitleCopy}>
            <Text style={[styles.routeEyebrow, { color: colors.green700 }]}>WALKING ROUTE</Text>
            <Text style={[styles.routeTitle, { color: colors.foreground }]}>To {venue.name}</Text>
          </View>
          <View style={[styles.livePill, { backgroundColor: colors.openBackground }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.openForeground }]} />
            <Text style={[styles.liveText, { color: colors.openForeground }]}>Live</Text>
          </View>
        </View>
        <View style={[styles.routeStats, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
          <View style={styles.routeStat}>
            <PandaIcon name="walk" size={18} color={colors.green700} />
            <View>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>WALK</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{venue.walkingTime}</Text>
            </View>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.routeStat}>
            <PandaIcon name="map-pin" size={18} color={colors.green700} />
            <View>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DISTANCE</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{venue.distance}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.address, { color: colors.mutedForeground }]}>{venue.fullAddress}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${venue.name}`}
          onPress={goBackToVenue}
          style={({ pressed }) => [
            styles.returnButton,
            { backgroundColor: colors.green800 },
            pressed && styles.pressed,
          ]}
        >
          <PandaIcon name="arrow-left" size={17} color={colors.primaryForeground} />
          <Text style={[styles.returnButtonText, { color: colors.primaryForeground }]}>Back to restaurant</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    left: 16,
    position: 'absolute',
    right: 16,
    top: 0,
    zIndex: 5,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 13,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  backButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  headerTitle: {
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  headerEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.1 },
  headerName: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 2 },
  routeCard: {
    borderTopLeftRadius: 29,
    borderTopRightRadius: 29,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  routeCardHandle: { alignItems: 'center', marginBottom: 17 },
  handle: { borderRadius: 999, height: 4, width: 42 },
  routeEyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  routeIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  routeTitleCopy: { flex: 1 },
  routeEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.25 },
  routeTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 3 },
  livePill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { borderRadius: 999, height: 6, width: 6 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  routeStats: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', marginTop: 18, paddingVertical: 14 },
  routeStat: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9, justifyContent: 'center' },
  statDivider: { height: 30, width: 1 },
  statLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1.1 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 3 },
  address: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 14 },
  returnButton: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16, minHeight: 50 },
  returnButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  notFoundTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  notFoundButton: { borderRadius: 999, marginTop: 18, paddingHorizontal: 20, paddingVertical: 13 },
  notFoundButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});