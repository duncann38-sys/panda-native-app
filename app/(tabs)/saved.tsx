import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PandaMark } from '@/components/PandaMark';
import { VenueCard } from '@/components/VenueCard';
import { useSavedVenues } from '@/context/saved-venues';
import { useColors } from '@/hooks/useColors';

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { savedVenues, isSaved, toggleSaved, hydrated } = useSavedVenues();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={savedVenues}
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
              onPress={() => router.push(`/venue/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          hydrated ? (
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
            <View style={styles.loading}>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Loading your places…</Text>
            </View>
          )
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
    padding: 35,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
});