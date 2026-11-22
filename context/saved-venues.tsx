import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '@/context/auth';
import { venues, type Venue, type VenueCategory } from '@/data/venues';
import { getPandaMeDb } from '@/utils/panda-me-firestore';

const STORAGE_KEY = '@panda-mobile/saved-venue-ids';
const RECORDS_KEY = STORAGE_KEY + ':records';
const SAVED_VENUE_FIELDS = new Set([
  'id',
  'name',
  'neighborhood',
  'category',
  'type',
  'distance',
  'walkingTime',
  'rating',
  'ratingCount',
  'price',
  'distanceMeters',
  'description',
  'hours',
  'feature',
  'fullAddress',
  'latitude',
  'longitude',
  'source',
  'sourceAttribution',
  'openNow',
  'cached',
  'website',
  'ticketUrl',
  'ticketUrlVerified',
  'ticketPlaceId',
  'officialVisitInfo',
  'mapsUri',
  'phone',
  'premium',
  'banging',
  'luxurySource',
  'bangingTransitMinutes',
  'bangingVerifiedAt',
  'promoted',
  'photoAttributions',
  'photoName',
  'photoCount',
  'primaryPhotoPath',
  'photoNames',
  'photoUris',
  'detailsDeferred',
  'discoveryCategories',
  'openingSourceName',
  'openingSourceUrl',
  'openingDate',
  'openingReportedAt',
  'openingDesignation',
  'openingEvidence',
]);
type SavedVenuesContextValue = {
  savedIds: string[];
  savedVenues: Venue[];
  isSaved: (venueId: string) => boolean;
  toggleSaved: (venue: Venue) => void;
  hydrated: boolean;
};
const SavedVenuesContext = createContext<SavedVenuesContextValue | null>(null);
const venueCategories: VenueCategory[] = [
  'Restaurant',
  'Bar',
  'Coffee',
  'Pub',
  'Shop',
  'Place of Interest',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function savedVenueFromRecord(id: string, record: Record<string, unknown>): Venue {
  const stored = isRecord(record.venueData) ? record.venueData : record;
  const fallback = venues.find((venue) => venue.id === id);
  const name =
    typeof stored.name === 'string'
      ? stored.name
      : typeof record.name === 'string'
        ? record.name
        : fallback?.name || 'Saved place';
  const category = venueCategories.includes(stored.category as VenueCategory)
    ? (stored.category as VenueCategory)
    : fallback?.category || 'Place of Interest';
  const neighborhood =
    typeof stored.neighborhood === 'string'
      ? stored.neighborhood
      : typeof record.neighborhood === 'string'
        ? record.neighborhood
        : fallback?.neighborhood || '';
  const fullAddress =
    typeof stored.fullAddress === 'string'
      ? stored.fullAddress
      : typeof record.formattedAddress === 'string'
        ? record.formattedAddress
        : fallback?.fullAddress || neighborhood;
  const photoUris = Array.isArray(stored.photoUris)
    ? stored.photoUris.filter(
        (photo): photo is { uri: string; attribution: string } =>
          isRecord(photo) && typeof photo.uri === 'string' && typeof photo.attribution === 'string',
      )
    : typeof record.photoUri === 'string' && record.photoUri
      ? [{ uri: record.photoUri, attribution: 'Venue photo' }]
      : fallback?.photoUris || [];
  const defaults: Venue = {
    id,
    name,
    neighborhood,
    category,
    type: category,
    distance: 'Nearby',
    walkingTime: '',
    rating: '',
    ratingCount: 0,
    price: '',
    distanceMeters: 0,
    description: '',
    hours: '',
    feature: '',
    fullAddress,
    openNow: false,
    website: '',
    mapsUri: '',
    phone: '',
    premium: false,
    banging: false,
    promoted: false,
    photoAttributions: [],
  };
  const merged = { ...defaults, ...(fallback || {}), ...stored } as Venue;
  return {
    ...merged,
    id,
    name,
    category,
    neighborhood,
    fullAddress,
    photoUris,
  };
}

function serializableVenue(venue: Venue): Record<string, unknown> {
  const data = JSON.parse(JSON.stringify(venue)) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(data).filter(([key]) => SAVED_VENUE_FIELDS.has(key)));
}

export function SavedVenuesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();
  const storageKey = account ? STORAGE_KEY + ':' + account.uid : STORAGE_KEY;
  const recordsStorageKey = storageKey + ':records';
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedVenueData, setSavedVenueData] = useState<Record<string, Venue>>({});
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    setHydrated(false);
    setCloudReady(false);
    setSavedIds([]);
    setSavedVenueData({});
    const load = async () => {
      let idsValue: string | null = null;
      let recordsValue: string | null = null;
      try {
        [idsValue, recordsValue] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          AsyncStorage.getItem(recordsStorageKey),
        ]);
        if (account) {
          if (idsValue === null) {
            idsValue = await AsyncStorage.getItem(STORAGE_KEY);
            if (idsValue !== null) {
              await AsyncStorage.setItem(storageKey, idsValue);
              await AsyncStorage.removeItem(STORAGE_KEY);
            }
          }
          if (recordsValue === null) {
            recordsValue = await AsyncStorage.getItem(RECORDS_KEY);
            if (recordsValue !== null) {
              await AsyncStorage.setItem(recordsStorageKey, recordsValue);
              await AsyncStorage.removeItem(RECORDS_KEY);
            }
          }
        }
        if (!live) return;
        if (idsValue) {
          try {
            const parsed: unknown = JSON.parse(idsValue);
            if (Array.isArray(parsed)) {
              setSavedIds([
                ...new Set(parsed.filter((id): id is string => typeof id === 'string')),
              ]);
            }
          } catch {
            /* Ignore corrupt local saved-place IDs. */
          }
        }
        if (recordsValue) {
          try {
            const parsed: unknown = JSON.parse(recordsValue);
            if (isRecord(parsed)) {
              const records: Record<string, Venue> = {};
              for (const [id, value] of Object.entries(parsed)) {
                if (isRecord(value)) records[id] = savedVenueFromRecord(id, { venueData: value });
              }
              setSavedVenueData(records);
            }
          } catch {
            /* Ignore corrupt local saved-place details. */
          }
        }
      } finally {
        if (live) setHydrated(true);
      }
    };
    load().catch(() => {
      if (live) setHydrated(true);
    });
    return () => {
      live = false;
    };
  }, [storageKey, recordsStorageKey, account?.uid]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(savedIds)).catch(() => undefined);
  }, [hydrated, savedIds, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const records = Object.fromEntries(
      savedIds.flatMap((id) =>
        savedVenueData[id] ? [[id, serializableVenue(savedVenueData[id])]] : [],
      ),
    );
    AsyncStorage.setItem(recordsStorageKey, JSON.stringify(records)).catch(() => undefined);
  }, [hydrated, recordsStorageKey, savedIds, savedVenueData]);

  useEffect(() => {
    cloudIdsRef.current = [];
    setCloudReady(false);
    if (!account) return;
    try {
      const db = getPandaMeDb();
      let firstSnapshot = true;
      const unsubscribe = onSnapshot(
        collection(db, 'users', account.uid, 'saved_venues'),
        (snapshot) => {
          const cloudIds = snapshot.docs.map((item) => item.id);
          const cloudRecords: Record<string, Venue> = {};
          for (const item of snapshot.docs)
            cloudRecords[item.id] = savedVenueFromRecord(item.id, item.data());
          cloudIdsRef.current = cloudIds;
          setSavedVenueData((current) => ({ ...current, ...cloudRecords }));
          if (firstSnapshot) {
            firstSnapshot = false;
            setSavedIds((current) => [...new Set([...current, ...cloudIds])]);
          } else {
            setSavedIds(cloudIds);
          }
          setCloudReady(true);
        },
        () => setCloudReady(true),
      );
      return unsubscribe;
    } catch {
      setCloudReady(true);
    }
  }, [account?.uid]);

  useEffect(() => {
    if (!account || !cloudReady || !hydrated) return;
    const before = new Set(cloudIdsRef.current);
    const after = new Set(savedIds);
    const db = (() => {
      try {
        return getPandaMeDb();
      } catch {
        return null;
      }
    })();
    if (!db) return;
    for (const id of after) {
      if (before.has(id)) continue;
      const venue = savedVenueData[id] || venues.find((item) => item.id === id);
      const venueData = venue ? serializableVenue(venue) : undefined;
      setDoc(
        doc(db, 'users', account.uid, 'saved_venues', id),
        {
          placeId: id,
          name: venue?.name || 'Saved place',
          category: venue?.category || 'Place of Interest',
          neighborhood: venue?.neighborhood || '',
          formattedAddress: venue?.fullAddress || '',
          latitude: venue?.latitude ?? null,
          longitude: venue?.longitude ?? null,
          photoUri: venue?.photoUris?.[0]?.uri || null,
          ...(venueData ? { venueData } : {}),
          status: 'want-to-try',
          savedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => undefined);
    }
    for (const id of before) {
      if (!after.has(id))
        deleteDoc(doc(db, 'users', account.uid, 'saved_venues', id)).catch(() => undefined);
    }
    cloudIdsRef.current = [...savedIds];
  }, [savedIds, savedVenueData, account?.uid, cloudReady, hydrated]);

  const toggleSaved = (venue: Venue) => {
    const isCurrentlySaved = savedIds.includes(venue.id);
    setSavedIds((current) =>
      isCurrentlySaved ? current.filter((id) => id !== venue.id) : [...current, venue.id],
    );
    setSavedVenueData((current) => {
      if (isCurrentlySaved) {
        const next = { ...current };
        delete next[venue.id];
        return next;
      }
      return { ...current, [venue.id]: venue };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const savedVenues = useMemo(
    () =>
      savedIds
        .map((id) => savedVenueData[id] || venues.find((venue) => venue.id === id))
        .filter((venue): venue is Venue => Boolean(venue)),
    [savedIds, savedVenueData],
  );
  const value = useMemo<SavedVenuesContextValue>(
    () => ({
      savedIds,
      savedVenues,
      isSaved: (venueId) => savedIds.includes(venueId),
      toggleSaved,
      hydrated,
    }),
    [hydrated, savedIds, savedVenues],
  );
  return <SavedVenuesContext.Provider value={value}>{children}</SavedVenuesContext.Provider>;
}

export function useSavedVenues() {
  const context = useContext(SavedVenuesContext);
  if (!context) throw new Error('useSavedVenues must be used within SavedVenuesProvider');
  return context;
}
