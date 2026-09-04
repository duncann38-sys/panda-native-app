import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { Venue } from '@/data/venues';

export type UserCoordinates = {
  latitude: number;
  longitude: number;
};

export type UserLocationSnapshot =
  | { status: 'ready'; coordinates: UserCoordinates }
  | { status: 'permission-denied' | 'unavailable'; coordinates: null };

type LiveVenuesContextValue = {
  coordinates: UserCoordinates | null;
  liveArea: string;
  liveVenues: Venue[];
  locationStatus: 'loading' | UserLocationSnapshot['status'];
  refreshLocation: (requestPermission?: boolean) => Promise<UserLocationSnapshot>;
  setLiveArea: React.Dispatch<React.SetStateAction<string>>;
  setLiveVenues: React.Dispatch<React.SetStateAction<Venue[]>>;
};

const LiveVenuesContext = createContext<LiveVenuesContextValue | null>(null);

export function LiveVenuesProvider({ children }: { children: React.ReactNode }) {
  const [coordinates, setCoordinates] = useState<UserCoordinates | null>(null);
  const [liveArea, setLiveArea] = useState('');
  const [liveVenues, setLiveVenues] = useState<Venue[]>([]);
  const [locationStatus, setLocationStatus] = useState<LiveVenuesContextValue['locationStatus']>('loading');

  const refreshLocation = useCallback(async (requestPermission = true): Promise<UserLocationSnapshot> => {
    setLocationStatus('loading');

    try {
      let nextCoordinates: UserCoordinates;

      if (Platform.OS === 'web') {
        const geolocation = globalThis.navigator?.geolocation;
        if (!geolocation) throw new Error('Browser geolocation unavailable');
        nextCoordinates = await new Promise<UserCoordinates>((resolve, reject) => {
          geolocation.getCurrentPosition(
            ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
            reject,
            { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
          );
        });
      } else {
        const permission = requestPermission
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        if (!permission.granted) {
          const denied = { status: 'permission-denied' as const, coordinates: null };
          setCoordinates(null);
          setLocationStatus(denied.status);
          return denied;
        }

        let position: Location.LocationObject | null = null;
        try {
          position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {
          position = await Location.getLastKnownPositionAsync({
            maxAge: 15 * 60_000,
            requiredAccuracy: 2_000,
          });
        }
        if (!position) {
          position = await Location.getLastKnownPositionAsync();
        }
        if (!position) throw new Error('Device location unavailable');
        nextCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }

      const ready = { status: 'ready' as const, coordinates: nextCoordinates };
      setCoordinates(nextCoordinates);
      setLocationStatus(ready.status);
      return ready;
    } catch (error) {
      const deniedByBrowser =
        Platform.OS === 'web'
        && typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 1;
      const unavailable = {
        status: deniedByBrowser ? 'permission-denied' as const : 'unavailable' as const,
        coordinates: null,
      };
      setCoordinates(null);
      setLocationStatus(unavailable.status);
      return unavailable;
    }
  }, []);

  useEffect(() => {
    void refreshLocation(true);
  }, [refreshLocation]);

  const value = useMemo(
    () => ({
      coordinates,
      liveArea,
      liveVenues,
      locationStatus,
      refreshLocation,
      setLiveArea,
      setLiveVenues,
    }),
    [coordinates, liveArea, liveVenues, locationStatus, refreshLocation],
  );

  return <LiveVenuesContext.Provider value={value}>{children}</LiveVenuesContext.Provider>;
}

export function useLiveVenues() {
  const context = useContext(LiveVenuesContext);
  if (!context) throw new Error('useLiveVenues must be used within LiveVenuesProvider');
  return context;
}