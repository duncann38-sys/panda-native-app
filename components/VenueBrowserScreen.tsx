import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PandaIcon } from '@/components/PandaIcon';
import { getVenue, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { loadOfficialVenueLinks, safeVenueUrl, type OfficialVenueLinks } from '@/utils/official-venue-links';

type VenueBrowserKind = 'menu' | 'reservation';

function isGoogleMapUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'maps.app.goo.gl') return true;

    const googleDomain = String.raw`google\.(?:[a-z]{2,}|(?:co|com|net|org|ac|gov)\.[a-z]{2})`;
    if (new RegExp(`^maps\\.${googleDomain}$`, 'i').test(hostname)) return true;

    const mapsPath = /^\/maps(?:\/|$)/i.test(parsed.pathname);
    return mapsPath && new RegExp(`^(?:www\\.)?${googleDomain}$`, 'i').test(hostname);
  } catch {
    return false;
  }
}

export function VenueBrowserScreen({ kind }: { kind: VenueBrowserKind }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, venueData } = useLocalSearchParams<{
    id: string;
    pageUrl?: string;
    venueData?: string;
  }>();
  const dynamicVenue = useMemo(() => {
    try {
      const parsed = venueData ? JSON.parse(String(venueData)) as Venue : null;
      return parsed?.id === id ? parsed : null;
    } catch {
      return null;
    }
  }, [id, venueData]);
  const venue = dynamicVenue ?? getVenue(id ?? '');
  const recordedPage = useRef<string | null>(null);
  useEffect(() => {
    const key = venue ? `${venue.id}:${kind}` : null;
    if (venue && key && recordedPage.current !== key) {
      recordedPage.current = key;
      recordVenueActivity(kind === 'menu' ? 'menu_click' : 'booking_click', venue);
    }
  }, [venue, kind]);
  const isMenu = kind === 'menu';
  const [linkResult, setLinkResult] = useState<{ id: string; links: OfficialVenueLinks | null } | null>(null);
  const [linksPending, setLinksPending] = useState(true);
  const [failedPage, setFailedPage] = useState<string | null>(null);
  const links = linkResult?.id === venue?.id ? linkResult?.links : null;
  const directUrl = isMenu ? links?.menuUrl : links?.reservationUrl;
  const pageUrl = directUrl || links?.website || safeVenueUrl(venue?.website) || '';
  const reservationLoading = linksPending || linkResult?.id !== venue?.id;
  const title = directUrl ? (isMenu ? 'View menu' : 'Reserve a table') : 'Venue website';
  const eyebrow = directUrl ? (isMenu ? 'PANDA MENU' : 'PANDA RESERVATIONS') : 'OFFICIAL VENUE WEBSITE';

  useEffect(() => {
    let active = true;
    if (!venue) {
      setLinksPending(false);
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    setLinksPending(true);
    loadOfficialVenueLinks(venue.id, controller.signal)
      .then((officialLinks) => {
        if (active) setLinkResult({ id: venue.id, links: officialLinks });
      })
      .catch(() => {
        if (active) setLinkResult({ id: venue.id, links: null });
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLinksPending(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [venue?.id]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(venue ? `/venue/${venue.id}` : '/');
  };
  const openPandaDirections = () => {
    if (!venue) return;
    router.push({
      pathname: '/map',
      params: {
        directionsVenueId: venue.id,
        directionsVenueData: JSON.stringify(venue),
        directionsReturn: 'back',
      },
    });
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
      {reservationLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.green800} size="large" />
          <Text style={[styles.loadingText, { color: colors.foreground }]}>Checking the venue’s official {isMenu ? 'menu' : 'booking'} link…</Text>
        </View>
      ) : !pageUrl || failedPage === pageUrl ? (
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: colors.foreground }]}>
            {!pageUrl ? 'This venue has no verified website available.' : 'This page could not load inside Panda. Try opening it in your browser below.'}
          </Text>
        </View>
      ) : Platform.OS === 'web'
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
            onError={() => setFailedPage(pageUrl)}
            onHttpError={() => setFailedPage(pageUrl)}
            onShouldStartLoadWithRequest={({ url }) => {
              if (isGoogleMapUrl(url) || /^(intent:|geo:|google\.navigation:)/i.test(url)) {
                openPandaDirections();
                return false;
              }
              return /^https?:\/\//i.test(url);
            }}
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
          {directUrl
            ? 'This link was found on the venue’s official website. No booking has been made by Panda.'
            : `A direct ${isMenu ? 'menu' : 'table-booking'} link could not be verified. ${pageUrl ? 'This is the venue’s website, not a confirmed menu or booking page.' : 'Please try again later.'}`}
        </Text>
        {pageUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open the venue page in your browser"
            testID="venue-page-open-browser"
            onPress={() => { void Linking.openURL(pageUrl).catch(() => setFailedPage(pageUrl)); }}
            style={{ paddingVertical: 12 }}
          >
            <Text style={[styles.bottomHintTitle, { color: colors.green800 }]}>Open in browser</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 24 },
  loadingText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
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