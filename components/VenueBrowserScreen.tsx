import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PandaIcon } from '@/components/PandaIcon';
import { getVenue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

type VenueBrowserKind = 'menu' | 'reservation';

export function VenueBrowserScreen({ kind }: { kind: VenueBrowserKind }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const venue = getVenue(id ?? '');
  const isMenu = kind === 'menu';
  const eyebrow = isMenu ? 'PANDA MENU' : 'PANDA RESERVATIONS';
  const title = isMenu ? 'View menu' : 'Reserve a table';
  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${venue?.name ?? 'London venue'} ${isMenu ? 'menu' : 'reservations'}`,
  )}`;
  const pageUrl = venue?.website || fallbackUrl;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(venue ? `/venue/${venue.id}` : '/');
  };

  if (!venue) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Venue unavailable</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to Panda"
          onPress={() => router.replace('/')}
          style={[styles.notFoundButton, { backgroundColor: colors.green800 }]}
        >
          <Text style={[styles.notFoundButtonText, { color: colors.primaryForeground }]}>Back to Panda</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      {Platform.OS === 'web'
        ? createElement('iframe', {
            title: `${title} for ${venue.name}`,
            src: pageUrl,
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
            source={{ uri: pageUrl }}
            originWhitelist={['https://*', 'http://*']}
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
          onPress={goBack}
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
          <Text style={[styles.headerEyebrow, { color: colors.green700 }]}>{eyebrow}</Text>
          <Text numberOfLines={1} style={[styles.headerName, { color: colors.foreground }]}>
            {venue.name}
          </Text>
        </View>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.bottomHint,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(12, insets.bottom + 8),
          },
        ]}
      >
        <Text style={[styles.bottomHintTitle, { color: colors.foreground }]}>{title} inside Panda</Text>
        <Text style={[styles.bottomHintText, { color: colors.mutedForeground }]}>
          Browse the venue’s official page without leaving the app.
        </Text>
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
  bottomHint: {
    borderRadius: 18,
    borderWidth: 1,
    bottom: 14,
    left: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: 'absolute',
    right: 16,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  bottomHintTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  bottomHintText: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  notFoundTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  notFoundButton: { borderRadius: 999, marginTop: 18, paddingHorizontal: 20, paddingVertical: 13 },
  notFoundButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});