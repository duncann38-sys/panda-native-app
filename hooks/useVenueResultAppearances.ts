import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { createVenueResultTracker, type ActivityVenue, type VenueActivitySurface } from '@/utils/venue-activity';
import { recordVenueResults } from '@/utils/record-venue-activity';

/** Results delivered to an active feed, deliberately separate from visibility. */
export function useVenueResultAppearances(
  venues: ActivityVenue[], surface: VenueActivitySurface, enabled: boolean, scope: string,
) {
  const path = usePathname();
  const [appState, setAppState] = useState(AppState.currentState);
  const tracker = useRef(createVenueResultTracker()).current;
  const active = enabled && (path === '/' || path === '/index') && appState === 'active';
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active) { tracker.reset(); return; }
    recordVenueResults(tracker.capture(venues, surface, scope));
  }, [active, venues, surface, scope, tracker]);
}
