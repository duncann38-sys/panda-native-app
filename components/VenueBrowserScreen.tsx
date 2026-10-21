import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { PandaIcon } from '@/components/PandaIcon';
import { getVenue } from '@/data/venues';
import { useLiveVenues } from '@/context/live-venues';
import { useColors } from '@/hooks/useColors';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { officialPageUrl } from '@/utils/official-venue-links';

type VenueBrowserKind = 'menu' | 'reservation';
type PageStatus = 'loading' | 'ready' | 'error';

// Some sites return HTTP 200 with an empty body or a failed app shell.
// Inspection stays inside the WebView; no page content is sent to Panda.
const CONTENT_CHECK = `
  setTimeout(function () {
    var body = document.body;
    var text = body ? (body.innerText || '').trim() : '';
    var visibleMedia = body && Array.from(body.querySelectorAll('img,iframe,embed,object,canvas,svg,video'))
      .some(function(el) { var r = el.getBoundingClientRect(); return r.width > 40 && r.height > 40; });
    window.ReactNativeWebView.postMessage(JSON.stringify({pandaPage: text.length > 12 || visibleMedia ? 'content' : 'empty'}));
  }, 1500);
  true;
`;

export function VenueBrowserScreen({ kind }: { kind: VenueBrowserKind }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, venueData, pageUrl: providedUrl } = useLocalSearchParams<{ id: string; venueData?: string; pageUrl?: string }>();
  const { liveVenues } = useLiveVenues();
  let passedVenue: ReturnType<typeof getVenue>;
  try { passedVenue = venueData ? JSON.parse(venueData) : undefined; } catch { passedVenue = undefined; }
  const venue = passedVenue?.id === id ? passedVenue : liveVenues.find(item => item.id === id) ?? getVenue(id ?? '');
  const recordedPage = useRef<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState(false);
  const [browserError, setBrowserError] = useState(false);
  const isMenu = kind === 'menu';
  const title = isMenu ? 'Menu' : 'Reservations';
  const pageUrl = officialPageUrl(providedUrl)?.replace(/^http:\/\/(?=(?:www\.)?sevenrooms\.com(?:\/|$))/i, 'https://');
  const androidPdf = isMenu && Platform.OS === 'android' && Boolean(pageUrl && /\.pdf(?:[?#]|$)/i.test(pageUrl));

  useEffect(() => {
    if (!venue) return;
    const key = `${venue.id}:${kind}`;
    if (recordedPage.current === key) return;
    recordedPage.current = key;
    recordVenueActivity(isMenu ? 'menu_click' : 'booking_click', venue);
  }, [venue?.id, venue?.name, kind]);

  useEffect(() => { setStatus('loading'); setBrowserError(false); }, [pageUrl, retry]);
  useEffect(() => {
    if (status !== 'loading' || androidPdf || !pageUrl) return;
    const timer = setTimeout(() => setStatus('error'), 15_000);
    return () => clearTimeout(timer);
  }, [status, pageUrl, retry, androidPdf]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(venue ? `/venue/${venue.id}` : '/');
  };
  const openOfficial = async () => {
    if (!pageUrl || opening) return;
    setOpening(true);
    setBrowserError(false);
    try {
      await WebBrowser.openBrowserAsync(pageUrl, {
        toolbarColor: colors.green800,
        controlsColor: colors.primaryForeground,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch { setBrowserError(true); }
    finally { setOpening(false); }
  };
  const actionStyle = { backgroundColor: colors.green800, borderColor: colors.border };
  const failed = status === 'error';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Panda" onPress={goBack}
          style={({ pressed }) => [styles.back, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
          <PandaIcon name="arrow-left" size={20} color={colors.green800} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.green700 }]}>PANDA · {title.toUpperCase()}</Text>
          <Text numberOfLines={2} style={[styles.name, { color: colors.foreground }]}>{venue?.name ?? 'Venue'}</Text>
        </View>
      </View>

      <View style={[styles.content, { backgroundColor: colors.card }]}>
        {pageUrl && venue && !androidPdf && (
          Platform.OS === 'web' ? createElement('iframe', {
            key: `${pageUrl}:${retry}`, title: `${title} for ${venue.name}`, src: pageUrl,
            onLoad: () => setStatus('ready'),
            onError: () => setStatus('error'),
            style: { border: 0, height: '100%', width: '100%' },
          }) : <WebView
            key={`${pageUrl}:${retry}`}
            source={{ uri: pageUrl }}
            originWhitelist={['https://*', 'http://*']}
            javaScriptEnabled domStorageEnabled
            setSupportMultipleWindows={false}
            sharedCookiesEnabled thirdPartyCookiesEnabled
            style={styles.webview}
            onLoadStart={() => setStatus('loading')}
            onError={() => setStatus('error')}
            onHttpError={() => setStatus('error')}
            onContentProcessDidTerminate={() => setStatus('error')}
            onRenderProcessGone={() => setStatus('error')}
            injectedJavaScript={CONTENT_CHECK}
            onMessage={event => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.pandaPage === 'empty') setStatus('error');
                if (message.pandaPage === 'content') setStatus('ready');
              } catch { /* Ignore the official site's own messages. */ }
            }}
          />
        )}
        {(!venue || !pageUrl || androidPdf || status !== 'ready') && (
          <View style={[styles.state, { backgroundColor: colors.card }]}>
            {pageUrl && venue && !androidPdf && !failed
              ? <ActivityIndicator size="large" color={colors.green800} />
              : <PandaIcon name="globe" size={30} color={colors.goldDeep} />}
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              {!pageUrl || !venue ? 'Official link unavailable' : androidPdf ? 'Your official PDF menu' : failed ? 'This page could not be displayed' : `Opening ${isMenu ? 'the menu' : 'reservations'}…`}
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              {androidPdf ? 'Open the original menu in your browser for a clear, zoomable view.'
                : !pageUrl || !venue ? 'Panda has not verified this venue’s link yet. Please return to the venue and try again.'
                  : failed ? 'Some official sites do not allow in-app viewing. You can still open the original page below.'
                    : 'Connecting to the venue’s official website.'}
            </Text>
            {failed && pageUrl && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}
              style={[styles.retry, { borderColor: colors.border }]}>
              <Text style={[styles.buttonText, { color: colors.green800 }]}>Try again</Text>
            </Pressable>}
          </View>
        )}
      </View>

      {pageUrl && venue && <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 8), borderTopColor: colors.border }]}>
        <View style={styles.source}>
          <PandaIcon name="globe" size={14} color={colors.green700} />
          <Text numberOfLines={1} style={[styles.sourceText, { color: colors.mutedForeground }]}>{new URL(pageUrl).hostname}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open official ${isMenu ? 'menu' : 'booking page'} in browser`}
          disabled={opening} onPress={() => void openOfficial()}
          style={({ pressed }) => [styles.open, actionStyle, pressed && styles.pressed]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{opening ? 'Opening…' : `Open ${isMenu ? 'menu' : 'booking page'} in browser`}</Text>
          <PandaIcon name="navigate" size={17} color={colors.primaryForeground} />
        </Pressable>
        {browserError && <Text accessibilityRole="alert" style={[styles.stateText, { color: colors.foreground }]}>The browser could not open. Please try again.</Text>}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  back: { width: 46, height: 46, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 4 },
  content: { flex: 1, overflow: 'hidden' },
  webview: { flex: 1 },
  state: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, textAlign: 'center' },
  stateText: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 22, justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, gap: 9 },
  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sourceText: { fontFamily: 'Inter_500Medium', fontSize: 11, flexShrink: 1 },
  open: { minHeight: 48, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  pressed: { opacity: 0.78 },
});
