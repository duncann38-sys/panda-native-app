import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PandaIcon } from '@/components/PandaIcon';
import { getVenue, type Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { recordVenueActivity } from '@/utils/record-venue-activity';
import { loadOfficialVenueLinks, type ReservationLinks } from '@/utils/official-venue-links';
import { ReservationContactActions } from './ReservationContactActions';
import { isReserveSurface } from '@/components/ReserveButton';
import { getReservationContacts, getReservationTarget, type ReservationTarget } from '@/utils/reservation-target';
import { isGooglePlaceVenue } from '@/utils/google-place-eligibility';

type Lookup = { status: 'loading' } | { status: 'done'; venueId: string; target: ReservationTarget; links: ReservationLinks | null };
const LOOKUP_TIMEOUT_MS = 6_000;

export function VenueReservationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, venueData, activitySurface } = useLocalSearchParams<{ id: string; venueData?: string; activitySurface?: string }>();
  const routeSurface = isReserveSurface(activitySurface) ? activitySurface : undefined;
  const venue = useMemo<Venue | null>(() => {
    try {
      const parsed = venueData ? JSON.parse(String(venueData)) as Venue : null;
      if (parsed && parsed.id === id && typeof parsed.name === 'string') return parsed;
    } catch { /* Use the existing catalogue only when the route payload is absent. */ }
    return getVenue(String(id ?? '')) ?? null;
  }, [id, venueData]);
  const retained = (venue as (Venue & { activityContext?: { surface?: unknown } }) | null)?.activityContext?.surface;
  const surface = routeSurface ?? (isReserveSurface(retained) ? retained : undefined);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const recorded = useRef(false);
  useEffect(() => {
    if (venue && !recorded.current) {
      recorded.current = true;
      recordVenueActivity('booking_click', venue, surface);
    }
  }, [venue, surface]);
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' });
  const [alternative, setAlternative] = useState<{ venueId: string; target: ReservationTarget } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pageFailed, setPageFailed] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const requestId = useRef(0);
  const browserRef = useRef<WebView>(null);
  const browserCanGoBack = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (browserRef.current && browserCanGoBack.current) {
        browserRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!venue) return;
    let active = true;
    const current = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    setLookup({ status: 'loading' });
    setAlternative(null);
    setPageFailed(false);
    setPageLoading(true);
    browserCanGoBack.current = false;
    const pending = isGooglePlaceVenue(venue)
      ? loadOfficialVenueLinks(venue.id, controller.signal, undefined, 'reservation')
      : Promise.reject(new Error('A Google venue is required.'));
    pending.then(links => ({ links, target: getReservationTarget(links, venue) }))
      .catch(() => ({ links: null, target: getReservationTarget(null, venue) })).then(result => {
      if (active && current === requestId.current) setLookup({ status: 'done', venueId: venue.id, ...result });
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [venue?.id, retryKey]);
  useEffect(() => {
    if (lookup.status !== 'done' || ['phone', 'maps', 'unavailable'].includes(lookup.target.provider) || !pageLoading || pageFailed) return;
    const timer = setTimeout(() => { setPageLoading(false); setPageFailed(true); }, 15_000);
    return () => clearTimeout(timer);
  }, [lookup, pageLoading, pageFailed, frameKey]);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(venue ? `/venue/${venue.id}` : '/');
  };
  if (!venue) return (
    <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Venue unavailable</Text>
      {getReservationContacts(null, { id }).maps ? <Pressable accessibilityRole="link"
        onPress={() => void Linking.openURL(getReservationContacts(null, { id }).maps!).catch(() => undefined)}
        style={[styles.primaryBtn, { backgroundColor: colors.green800 }]}>
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>View on Google Maps</Text>
      </Pressable> : null}
      <Pressable testID="reservation-return" accessibilityRole="button" onPress={() => router.replace('/')}
        style={[styles.primaryBtn, { backgroundColor: colors.green800, marginTop: 18 }]}>
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Back to Panda</Text>
      </Pressable>
    </View>
  );
  const target = alternative?.venueId === venue.id ? alternative.target
    : lookup.status === 'done' && lookup.venueId === venue.id ? lookup.target : null;
  const contacts = getReservationContacts(lookup.status === 'done' && lookup.venueId === venue.id ? lookup.links : null, venue);
  const providerLabel = target?.provider === 'opentable' ? 'OpenTable' : target?.provider === 'website' ? 'the venue website' : 'Venue booking';
  const providerHost = target?.url ? new URL(target.url).hostname.replace(/^www\./, '') : '';
  const showBrowser = Boolean(target?.url && !['phone', 'maps'].includes(target.provider));
  const openExternal = () => {
    if (target?.url) void Linking.openURL(target.url).catch(() => setPageFailed(true));
  };
  const retryPage = () => { setPageFailed(false); setPageLoading(true); setFrameKey(k => k + 1); };
  const openWebsite = () => {
    if (!contacts.website) return;
    setAlternative({ venueId: venue.id, target: { provider: 'website', url: contacts.website, reason: null } });
    retryPage();
  };
  const meta = [venue.neighborhood, venue.type, venue.price].filter(Boolean).join('  ·  ');
  const header = (
    <View style={[styles.header, { paddingTop: Math.max(12, topInset + 6), backgroundColor: colors.ivory, borderBottomColor: colors.border }]}>
      <Pressable testID="reservation-back" accessibilityRole="button"
        accessibilityLabel={showBrowser ? 'Back to Panda' : `Back to ${venue.name}`}
        onPress={goBack} hitSlop={6}
        style={({ pressed }) => [styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}>
        <PandaIcon name="arrow-left" size={18} color={colors.green800} />
        <Text style={[styles.backText, { color: colors.green800 }]}>{showBrowser ? 'Back to Panda' : 'Back'}</Text>
      </Pressable>
      <View style={styles.headerTitle}>
        <Text style={[styles.eyebrow, { color: colors.green700 }]}>{showBrowser ? target?.provider === 'opentable' ? 'VIA OPENTABLE' : target?.provider === 'website' ? 'VENUE WEBSITE' : 'VENUE BOOKING PAGE' : 'PANDA RESERVE'}</Text>
        <Text numberOfLines={1} style={[styles.headerName, { color: colors.foreground }]}>{venue.name}</Text>
      </View>
      {showBrowser ? <Pressable testID="reservation-open-browser-header" accessibilityRole="link"
        accessibilityLabel="Open booking page in your browser" onPress={openExternal} style={styles.iconBtn}>
        <PandaIcon name="globe" size={20} color={colors.green800} />
      </Pressable> : null}
    </View>
  );
  if (showBrowser && target?.url) return (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      {header}
      <View style={styles.browserBody}>
        {pageFailed ? (
          <ScrollView contentContainerStyle={styles.recovery} testID="reservation-page-error">
            <PandaIcon name="globe" size={28} color={colors.mutedForeground} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>The page couldn’t be opened</Text>
            <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>{providerLabel} may block in-app viewing. You can retry or continue in your browser.</Text>
            <View style={styles.row}>
              <Pressable testID="reservation-page-retry" accessibilityRole="button" onPress={retryPage} style={[styles.secondaryBtn, { borderColor: colors.green800 }]}>
                <Text style={[styles.secondaryBtnText, { color: colors.green800 }]}>Retry</Text>
              </Pressable>
              <Pressable testID="reservation-page-external" accessibilityRole="link" onPress={openExternal} style={[styles.primaryBtn, { backgroundColor: colors.green800 }]}>
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Open in browser</Text>
              </Pressable>
            </View>
            <ReservationContactActions key={venue.id} venue={venue} surface={surface} contacts={contacts}
              onWebsite={openWebsite} showWebsite={contacts.website !== target.url} />
          </ScrollView>
        ) : Platform.OS === 'web' ? createElement('iframe', {
          key: frameKey, title: `${providerLabel} for ${venue.name}`, src: target.url,
          referrerPolicy: 'no-referrer-when-downgrade', onLoad: () => setPageLoading(false),
          onError: () => { setPageLoading(false); setPageFailed(true); },
          style: { border: 0, height: '100%', width: '100%' },
        }) : (
          <WebView ref={browserRef} key={frameKey} source={{ uri: target.url }} originWhitelist={['https://*', 'http://*']}
            javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false}
            onNavigationStateChange={state => { browserCanGoBack.current = state.canGoBack; }}
            onShouldStartLoadWithRequest={request => /^https?:\/\//i.test(request.url) || request.url === 'about:blank'}
            onLoadEnd={() => setPageLoading(false)} onError={() => setPageFailed(true)}
            onRenderProcessGone={() => { setPageFailed(true); return true; }}
            onContentProcessDidTerminate={() => setPageFailed(true)}
            onHttpError={e => { if (e.nativeEvent.statusCode >= 400) setPageFailed(true); }} style={StyleSheet.absoluteFill} />
        )}
        {pageLoading && !pageFailed ? <View pointerEvents="none" style={[styles.pageLoading, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.green800} /><Text style={[styles.smallText, { color: colors.foreground }]}>Opening {providerLabel}</Text>
        </View> : null}
      </View>
      <View style={[styles.attribution, { backgroundColor: colors.ivory, borderTopColor: colors.border, paddingBottom: Math.max(10, bottomInset) }]}>
        <Text numberOfLines={2} style={[styles.smallText, { color: colors.mutedForeground, flex: 1 }]}>
          {target.provider === 'opentable' ? `Bookings and confirmations are handled by OpenTable (${providerHost}).`
            : target.provider === 'website' ? `Official venue website (${providerHost}). Check its booking or contact options.`
              : `Bookings and confirmations are handled by the venue at ${providerHost}.`}
        </Text>
        <Pressable testID="reservation-open-browser" accessibilityRole="link" onPress={openExternal} style={styles.linkBtn}>
          <Text style={[styles.linkText, { color: colors.green800 }]}>Open in browser</Text>
        </Pressable>
      </View>
    </View>
  );
  return (
    <View style={[styles.screen, { backgroundColor: colors.secondary }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, bottomInset + 16) }]}>
        <View style={[styles.summary, { backgroundColor: colors.green800 }]}>
          <Text style={[styles.summaryKicker, { color: colors.mint300 }]}>YOUR NEXT TABLE</Text>
          <Text style={[styles.summaryName, { color: colors.primaryForeground }]}>{venue.name}</Text>
          {meta ? <Text style={[styles.summaryMeta, { color: colors.mint100 }]}>{meta}</Text> : null}
          {venue.fullAddress ? <View style={styles.addressRow}>
            <PandaIcon name="map-pin" size={14} color={colors.mint300} />
            <Text style={[styles.summaryMeta, { color: colors.mint100, flex: 1, marginTop: 0 }]}>{venue.fullAddress}</Text>
          </View> : null}
        </View>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!target ? <View testID="reservation-loading" style={styles.panelInner}>
            <View style={[styles.skeleton, { backgroundColor: colors.muted, width: '45%' }]} />
            <View style={[styles.skeleton, { backgroundColor: colors.muted, width: '80%' }]} />
            <View style={styles.rowCenter}><ActivityIndicator color={colors.green800} />
              <Text style={[styles.smallText, { color: colors.foreground }]}>Checking the venue’s verified booking link</Text>
            </View>
          </View> : <View testID="reservation-contact-fallback" style={styles.panelInner}>
            <Text style={[styles.panelEyebrow, { color: colors.green700 }]}>CONTACT THE VENUE</Text>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>{target.provider === 'phone' ? 'Call to reserve' : 'Find the venue on Google Maps'}</Text>
            <Text style={[styles.stateBody, { color: colors.mutedForeground, textAlign: 'left' }]}>
              {target.provider === 'phone' ? 'Speak to the venue about a table. Panda will open your dialler; you choose whether to call.'
                : 'Check the venue’s Google Maps listing for current contact and booking options.'}
            </Text>
            <ReservationContactActions key={venue.id} venue={venue} surface={surface} contacts={contacts} onWebsite={openWebsite} />
            <Pressable testID="reservation-retry" accessibilityRole="button" onPress={() => setRetryKey(k => k + 1)}
              style={[styles.secondaryBtn, styles.fullBtn, { borderColor: colors.green800 }]}>
              <Text style={[styles.secondaryBtnText, { color: colors.green800 }]}>Retry lookup</Text>
            </Pressable>
          </View>}
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  recovery: { alignItems: 'center', flexGrow: 1, gap: 12, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 10, paddingHorizontal: 14, zIndex: 5 },
  backBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  backText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  headerTitle: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.2 },
  headerName: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 2 },
  iconBtn: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { gap: 14, padding: 16 },
  summary: { borderRadius: 22, padding: 20 },
  summaryKicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.4 },
  summaryName: { fontFamily: 'serif', fontSize: 28, letterSpacing: -0.6, lineHeight: 33, marginTop: 6 },
  summaryMeta: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, marginTop: 8 },
  addressRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6, marginTop: 10 },
  panel: { borderRadius: 20, borderWidth: 1 },
  panelInner: { gap: 10, padding: 18 },
  panelEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
  panelTitle: { fontFamily: 'serif', fontSize: 21, letterSpacing: -0.3, lineHeight: 26 },
  skeleton: { borderRadius: 6, height: 14 },
  rowCenter: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 6 },
  hostPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6 },
  hostText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  primaryBtn: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
  primaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondaryBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
  secondaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  fullBtn: { alignSelf: 'stretch', marginTop: 4 },
  linkBtn: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  linkText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, textAlign: 'center' },
  stateBody: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  smallText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  browserBody: { flex: 1, position: 'relative' },
  pageLoading: { alignItems: 'center', alignSelf: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 9, position: 'absolute', top: 16 },
  attribution: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
