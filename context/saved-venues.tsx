import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { venues, type Venue } from '@/data/venues';

const STORAGE_KEY = '@panda-mobile/saved-venue-ids';

type SavedVenuesContextValue = {
  savedIds: string[];
  savedVenues: Venue[];
  isSaved: (venueId: string) => boolean;
  toggleSaved: (venue: Venue) => void;
  hydrated: boolean;
};

const SavedVenuesContext = createContext<SavedVenuesContextValue | null>(null);

export function SavedVenuesProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value) {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            setSavedIds(parsed.filter((id): id is string => typeof id === 'string'));
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(savedIds)).catch(() => undefined);
    }
  }, [hydrated, savedIds]);

  const toggleSaved = (venue: Venue) => {
    setSavedIds((current) =>
      current.includes(venue.id)
        ? current.filter((id) => id !== venue.id)
        : [...current, venue.id],
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const value = useMemo<SavedVenuesContextValue>(
    () => ({
      savedIds,
      savedVenues: venues.filter((venue) => savedIds.includes(venue.id)),
      isSaved: (venueId) => savedIds.includes(venueId),
      toggleSaved,
      hydrated,
    }),
    [hydrated, savedIds],
  );

  return <SavedVenuesContext.Provider value={value}>{children}</SavedVenuesContext.Provider>;
}

export function useSavedVenues() {
  const context = useContext(SavedVenuesContext);
  if (!context) {
    throw new Error('useSavedVenues must be used within SavedVenuesProvider');
  }
  return context;
}