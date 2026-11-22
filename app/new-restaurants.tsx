import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VenueCard } from '@/components/VenueCard';
import { PandaIcon } from '@/components/PandaIcon';
import { PandaLogo } from '@/components/PandaLogo';
import { useColors } from '@/hooks/useColors';
import { useNewRestaurants } from '@/hooks/useNewRestaurants';
import { useSavedVenues } from '@/context/saved-venues';
import type { Venue } from '@/data/venues';
import { recordVenueActivity, recordVenueExposure } from '@/utils/record-venue-activity';

type Viewable = { viewableItems: ViewToken[] };

export default function NewRestaurantsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { venues, loading, text, error, status, city, country, area, hasMore, refresh, loadNext } = useNewRestaurants();
  const { isSaved, toggleSaved } = useSavedVenues();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;

  // Presentation: any part of the card actually on screen. Impression: 50% for 600ms.
  const pairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 1 },
      onViewableItemsChanged: ({ viewableItems }: Viewable) => {
        viewableItems.forEach((t) => t.isViewable && t.item && recordVenueExposure('presentation', t.item as Venue, 'discovery'));
      },
    },
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 600 },
      onViewableItemsChanged: ({ viewableItems }: Viewable) => {
        viewableItems.forEach((t) => t.isViewable && t.item && recordVenueExposure('impression', t.item as Venue, 'discovery'));
      },
    },
  ]).current;

  const open = useCallback((venue: Venue) => {
    recordVenueActivity('detail_open', venue, 'discovery');
    router.push({
      pathname: '/venue/[id]',
      params: { id: venue.id, venueData: JSON.stringify(venue), plannerLocation: 'Current location' },
    });
  }, []);

  const openSource = useCallback((venue: Venue) => {
    if (!venue.openingSourceUrl) return;
    void Linking.openURL(venue.openingSourceUrl).catch(() => {
      // A source link is optional; the verified venue card remains usable.
    });
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const firstLoad = loading && venues.length === 0;
  const notReady = !loading && !error && venues.length === 0 && status !== 'ready' && status !== 'idle' && status !== 'no_results';
  const locationLine = area || [city, country].filter(Boolean).join(', ');

  const header = (
    <View>
      <Text style={[styles.kicker, { color: colors.honeyInk }]}>PANDA NEW OPENINGS</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Freshly opened, worth knowing</Text>
      <Text style={[styles.lede, { color: colors.mutedForeground }]}>
        Independent high-end places, newly opened and checked against live venue listings. Your location comes first.
      </Text>
      {locationLine ? (
        <View style={[styles.radius, { backgroundColor: colors.goldSoft, borderColor: colors.goldLine }]}>
          <PandaIcon name="map-pin" size={14} color={colors.goldDeep} />
          <Text style={[styles.radiusText, { color: colors.honeyInk }]}>{locationLine}</Text>
        </View>
      ) : null}
      {text && venues.length > 0 ? <Text style={[styles.note, { color: colors.mutedForeground }]}>{text}</Text> : null}
      {error && venues.length > 0 ? (
        <View style={[styles.inlineError, { backgroundColor: colors.closedBackground }]}>
          <Text style={[styles.inlineErrorText, { color: colors.closedForeground }]}>{error} Showing your previous selection.</Text>
        </View>
      ) : null}
    </View>
  );

  const state = () => {
    if (firstLoad) {
      return (
        <View>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.skelPhoto, { backgroundColor: colors.muted }]} />
              <View style={[styles.skelLine, { backgroundColor: colors.muted, width: '62%' }]} />
              <View style={[styles.skelLine, { backgroundColor: colors.muted, width: '38%' }]} />
            </View>
          ))}
          <Text style={[styles.note, { color: colors.mutedForeground, textAlign: 'center' }]}>Checking verified openings near you…</Text>
        </View>
      );
    }
    const title = error ? 'We couldn’t load new openings' : notReady ? 'Verified openings aren’t ready yet' : 'Nothing new nearby just now';
    const body = error
      ?? (notReady
        ? text || 'Panda’s live sources haven’t confirmed an opening for this area yet. This isn’t a guess — please check back shortly.'
        : text || 'No recent, verified high-end openings were found in this area. Try again later.');
    return (
      <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <PandaLogo size={42} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
        <Pressable testID="new-retry" onPress={() => void refresh()} style={({ pressed }) => [styles.retry, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}>
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try again</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.bar, { paddingTop: top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="new-back" accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={goBack}
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
          <PandaIcon name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <PandaLogo size={30} />
        <Pressable testID="new-refresh" accessibilityRole="button" accessibilityLabel="Refresh new openings" hitSlop={10}
          disabled={loading} onPress={() => void refresh()}
          style={({ pressed }) => [styles.refresh, { backgroundColor: colors.card, borderColor: colors.border }, (pressed || loading) && { opacity: 0.6 }]}>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.refreshText, { color: colors.primary }]}>Refresh</Text>}
        </Pressable>
      </View>
      <FlatList
        data={venues}
        keyExtractor={(v) => v.id}
        ListHeaderComponent={header}
        ListEmptyComponent={state}
        viewabilityConfigCallbackPairs={pairs}
        contentContainerStyle={[styles.list, { paddingBottom: bottom + 28 }]}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListFooterComponent={hasMore ? (
          <Pressable testID="new-next-page" accessibilityRole="button" accessibilityLabel="Show the next 15 new openings"
            disabled={loading} onPress={() => void loadNext()}
            style={({ pressed }) => [styles.nextPage, { backgroundColor: colors.primary }, (pressed || loading) && { opacity: 0.65 }]}>
            {loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.nextPageText, { color: colors.primaryForeground }]}>Discover the next 15</Text>}
          </Pressable>
        ) : null}
        renderItem={({ item }) => (
          <View>
            <View style={styles.distanceRow}>
              <PandaIcon name="walk" size={13} color={colors.mutedForeground} />
              <Text style={[styles.distance, { color: colors.mutedForeground }]}>{item.distance} away</Text>
            </View>
            <VenueCard venue={item} saved={isSaved(item.id)} onPress={() => open(item)} onToggleSaved={() => toggleSaved(item)} />
            {item.openingSourceUrl ? (
              <Pressable accessibilityRole="link" accessibilityLabel={item.openingDesignation === 'panda-search-reported-new' ? 'Check Google results for ' + item.name : 'Read opening report from ' + (item.openingSourceName || 'source')}
                onPress={() => openSource(item)} style={({ pressed }) => [styles.sourceLink, pressed && { opacity: 0.65 }]}>
                <PandaIcon name="external-link" size={14} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.sourceLinkText, { color: colors.primary }]}>{item.openingDesignation === 'panda-search-reported-new' ? 'Google results · verify opening' : 'Opening report · ' + (item.openingSourceName || 'Read source')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, paddingHorizontal: 18 },
  iconBtn: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  refresh: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', minWidth: 86, paddingHorizontal: 14 },
  refreshText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  list: { paddingHorizontal: 18, paddingTop: 22 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6 },
  title: { fontFamily: 'serif', fontSize: 32, letterSpacing: -0.8, lineHeight: 36, marginTop: 8 },
  lede: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginTop: 8 },
  radius: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: 14, paddingHorizontal: 11, paddingVertical: 6 },
  radiusText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 12 },
  inlineError: { borderRadius: 12, marginTop: 12, padding: 10 },
  inlineErrorText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  distanceRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginBottom: 7, marginTop: 6 },
  distance: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.2 },
  skeleton: { borderRadius: 22, borderWidth: 1, marginTop: 22, overflow: 'hidden', paddingBottom: 16 },
  skelPhoto: { height: 136, marginBottom: 14 },
  skelLine: { borderRadius: 6, height: 12, marginHorizontal: 13, marginTop: 8 },
  empty: { alignItems: 'center', borderRadius: 22, borderWidth: 1, marginTop: 24, padding: 24 },
  emptyTitle: { fontFamily: 'serif', fontSize: 21, marginTop: 14, textAlign: 'center' },
  emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  retry: { borderRadius: 999, marginTop: 18, paddingHorizontal: 22, paddingVertical: 11 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  sourceLink: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 10, paddingHorizontal: 4, paddingVertical: 5 },
  sourceLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  nextPage: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 999, marginTop: 20, paddingHorizontal: 22, paddingVertical: 14 },
  nextPageText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 0.2 },
});
