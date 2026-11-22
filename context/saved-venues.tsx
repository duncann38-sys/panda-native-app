import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/context/auth';
import { venues, type Venue } from '@/data/venues';
import { getPandaMeDb } from '@/utils/panda-me-firestore';

const STORAGE_KEY = '@panda-mobile/saved-venue-ids';
type SavedVenuesContextValue = { savedIds: string[]; savedVenues: Venue[]; isSaved: (venueId: string) => boolean; toggleSaved: (venue: Venue) => void; hydrated: boolean };
const SavedVenuesContext = createContext<SavedVenuesContextValue | null>(null);

export function SavedVenuesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const storageKey = account ? STORAGE_KEY + ':' + account.uid : STORAGE_KEY;
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    setHydrated(false);
    setCloudReady(false);
    setSavedIds([]);
    AsyncStorage.getItem(storageKey)
      .then(async (value) => {
        let savedValue = value;
        if (savedValue === null && account) {
          savedValue = await AsyncStorage.getItem(STORAGE_KEY);
          if (savedValue !== null) { await AsyncStorage.setItem(storageKey, savedValue); await AsyncStorage.removeItem(STORAGE_KEY); }
        }
        if (!live || !savedValue) return;
        try {
          const parsed: unknown = JSON.parse(savedValue);
          if (Array.isArray(parsed)) setSavedIds((current) => [...new Set([...current, ...parsed.filter((id): id is string => typeof id === 'string')])]);
        } catch { /* Ignore corrupt local saved-place data. */ }
      })
      .catch(() => undefined)
      .finally(() => { if (live) setHydrated(true); });
    return () => { live = false; };
  }, [storageKey, account]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(savedIds)).catch(() => undefined);
  }, [hydrated, savedIds, storageKey]);

  useEffect(() => {
    cloudIdsRef.current = [];
    setCloudReady(false);
    if (!account) return;
    try {
      const db = getPandaMeDb();
      let firstSnapshot = true;
      const unsubscribe = onSnapshot(collection(db, 'users', account.uid, 'saved_venues'), (snapshot) => {
        const cloudIds = snapshot.docs.map((item) => item.id);
        cloudIdsRef.current = cloudIds;
        if (firstSnapshot) {
          firstSnapshot = false;
          setSavedIds((current) => [...new Set([...current, ...cloudIds])]);
        } else {
          setSavedIds(cloudIds);
        }
        setCloudReady(true);
      }, () => setCloudReady(true));
      return unsubscribe;
    } catch {
      setCloudReady(true);
    }
  }, [account?.uid]);

  useEffect(() => {
    if (!account || !cloudReady || !hydrated) return;
    const before = new Set(cloudIdsRef.current);
    const after = new Set(savedIds);
    const db = (() => { try { return getPandaMeDb(); } catch { return null; } })();
    if (!db) return;
    for (const id of after) {
      if (before.has(id)) continue;
      const venue = venues.find((item) => item.id === id);
      setDoc(doc(db, 'users', account.uid, 'saved_venues', id), {
        placeId: id,
        name: venue?.name || 'Saved place',
        category: venue?.category || 'Place of Interest',
        neighborhood: venue?.neighborhood || '',
        formattedAddress: venue?.fullAddress || '',
        latitude: venue?.latitude ?? null,
        longitude: venue?.longitude ?? null,
        photoUri: venue?.photoUris?.[0]?.uri || null,
        status: 'want-to-try',
        savedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => undefined);
    }
    for (const id of before) {
      if (!after.has(id)) deleteDoc(doc(db, 'users', account.uid, 'saved_venues', id)).catch(() => undefined);
    }
    cloudIdsRef.current = [...savedIds];
  }, [savedIds, account?.uid, cloudReady, hydrated]);

  const toggleSaved = (venue: Venue) => {
    setSavedIds((current) => current.includes(venue.id) ? current.filter((id) => id !== venue.id) : [...current, venue.id]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  const value = useMemo<SavedVenuesContextValue>(() => ({ savedIds, savedVenues: venues.filter((venue) => savedIds.includes(venue.id)), isSaved: (venueId) => savedIds.includes(venueId), toggleSaved, hydrated }), [hydrated, savedIds]);
  return <SavedVenuesContext.Provider value={value}>{children}</SavedVenuesContext.Provider>;
}

export function useSavedVenues() {
  const context = useContext(SavedVenuesContext);
  if (!context) throw new Error('useSavedVenues must be used within SavedVenuesProvider');
  return context;
}
