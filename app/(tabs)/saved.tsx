import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaMark } from '@/components/PandaMark';
import { VenueCard } from '@/components/VenueCard';
import { PANDA_RUNTIME_API } from '@/constants/services';
import { useSavedVenues } from '@/context/saved-venues';
import type { Venue } from '@/data/venues';
import { useColors } from '@/hooks/useColors';
import { buildLiveSavedVenue, type LiveSavedVenuePhoto, type LiveSavedVenueProfile } from '@/utils/saved-venue-hydration';

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { savedIds, savedVenues, isSaved, toggleSaved, hydrated } = useSavedVenues();
  const [liveVenues, setLiveVenues] = useState<Record<string, Venue>>({});
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const catalogById = useMemo(() => new Map(savedVenues.map((venue) => [venue.id, venue])), [savedVenues]);

  useEffect(() => {
    if (!hydrated || !savedIds.length) {
      setLoadingLive(false);
      return;
    }
    const placeIds = savedIds.filter(
      (id) => !catalogById.has(id) && !liveVenues[id] && !failedIds.includes(id),
    );
    if (!placeIds.length) {
      setLoadingLive(false);
      return;
    }

    const controller = new AbortController();
    setLoadingLive(true);
    Promise.all(placeIds.map(async (placeId) => {
      try {
        const profileResponse = await fetch(
          `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/profile`,
          { signal: controller.signal },
        );
        if (!profileResponse.ok) throw new Error('Venue details are unavailable.');
        const profile = await profileResponse.json() as LiveSavedVenueProfile;

        let photos: LiveSavedVenuePhoto[] = [];
        try {
          const photosResponse = await fetch(
            `${PANDA_RUNTIME_API}/api/partner/venues/${encodeURIComponent(placeId)}/photos`,
            { signal: controller.signal },
          );
          if (photosResponse.ok) {
            const payload = await photosResponse.json() as { photos?: LiveSavedVenuePhoto[] };
            photos = Array.isArray(payload.photos) ? payload.photos : [];
          }
        } catch {
          if (controller.signal.aborted) throw new Error('Saved place loading was cancelled.');
        }

        return { id: placeId, venue: buildLiveSavedVenue(profile, photos, PANDA_RUNTIME_API) };
      } catch {
        return { id: placeId, venue: null };
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const successful = results.filter((result): result is { id: string; venue: Venue } => result.venue !== null);
      const failed = results.filter((result) => result.venue === null).map((result) => result.id);
      setLiveVenues((current) => ({
        ...current,
        ...Object.fromEntries(successful.map((result) => [result.id, result.venue])),
      }));
      setFailedIds((current) => [
        ...current.filter((id) => savedIds.includes(id) && !placeIds.includes(id)),
        ...failed,
      ]);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingLive(false);
    });

    return () => controller.abort();
  }, [catalogById, failedIds, hydrated, liveVenues, retryKey, savedIds]);

  useEffect(() => {
    setFailedIds((current) => current.filter((id) => savedIds.includes(id)));
  }, [savedIds]);

  const retryFailedPlaces = () => {
    setFailedIds([]);
    setRetryKey((current) => current + 1);
  };

  const venuesById = useMemo(
    () => new Map([...savedVenues, ...Object.values(liveVenues)].map((venue) => [venue.id, venue])),
    [liveVenues, savedVenues],
  );
  const displayedVenues = useMemo(
    () => savedIds.flatMap((id) => {
      const venue = venuesById.get(id);
      return venue ? [venue] : [];
    }),
    [savedIds, venuesById],
  );
  const displayedFailures = failedIds.filter((id) => savedIds.includes(id));
  const waitingForSavedVenue = savedIds.length > 0
    && displayedVenues.length === 0
    && displayedFailures.length === 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={displayedVenues}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 78 : insets.top + 15, paddingBottom: 108 },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <PandaMark compact />
            <Text style={[styles.title, { color: colors.foreground }]}>Saved places</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Keep the good ones close.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <VenueCard
              venue={item}
              saved={isSaved(item.id)}
              onToggleSaved={() => toggleSaved(item)}
              onPress={() => router.push({
                pathname: '/venue/[id]',
                params: { id: item.id, venueData: JSON.stringify(item) },
              })}
            />
          </View>
        )}
        ListEmptyComponent={
          !hydrated || loadingLive || waitingForSavedVenue ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.green700} />
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Loading your places…</Text>
            </View>
          ) : savedIds.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.honeySoft }]}>
                <Ionicons name="heart-outline" size={25} color={colors.honeyInk} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your shortlist is empty</Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                Tap the heart on a place you like and it will show up here.
              </Text>
              <Pressable
                testID="explore-from-saved"
                accessibilityRole="button"
                onPress={() => router.replace('/(tabs)')}
                style={({ pressed }) => [
                  styles.exploreButton,
                  { backgroundColor: colors.green800 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Explore places</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.honeySoft }]}>
                <Ionicons name="refresh-outline" size={25} color={colors.honeyInk} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Could not refresh saved places</Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                Your saved place IDs are still here. Check your connection and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retryFailedPlaces}
                style={({ pressed }) => [
                  styles.exploreButton,
                  { backgroundColor: colors.green800 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Try again</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          displayedVenues.length && (loadingLive || displayedFailures.length) ? (
            <View style={styles.footerState}>
              {loadingLive ? <ActivityIndicator color={colors.green700} /> : null}
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {loadingLive ? 'Refreshing saved places…' : 'Some saved places could not be refreshed.'}
              </Text>
              {!loadingLive ? (
                <Pressable accessibilityRole="button" onPress={retryFailedPlaces}>
                  <Text style={[styles.retryText, { color: colors.green700 }]}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    letterSpacing: -0.8,
    marginTop: 24,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 5,
  },
  item: {
    marginBottom: 14,
  },
  empty: {
    alignItems: 'center',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 310,
    padding: 26,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 14,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 260,
    textAlign: 'center',
  },
  exploreButton: {
    borderRadius: 999,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  exploreButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  loading: {
    alignItems: 'center',
    gap: 10,
    padding: 35,
  },
  footerState: { alignItems: 'center', gap: 9, paddingVertical: 20 },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 13, padding: 8 },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});