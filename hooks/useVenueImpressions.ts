import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type ViewToken } from 'react-native';
import { usePathname } from 'expo-router';
import { recordVenueExposure } from '@/utils/record-venue-activity';
import type { VenueActivitySurface } from '@/utils/venue-activity';

/** A show means >=50% visible for 600ms, not merely downloaded or rendered.
 * Repeat visibility is coalesced per venue/surface for one minute.
 */
export function useVenueImpressions(surface: VenueActivitySurface, enabled = true) {
  const path = usePathname();
  const [appState, setAppState] = useState(AppState.currentState);
  const active = enabled && (path === '/' || path === '/index') && appState === 'active';
  const activeRef = useRef(active);
  activeRef.current = active;
  const visible = useRef<ViewToken[]>([]);
  const presented = useRef<ViewToken[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastSeen = useRef(new Map<string, number>());
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const presentationConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;
  const present = useCallback(() => {
    if (activeRef.current) for (const token of presented.current) {
      if (token.isViewable && token.item?.id) recordVenueExposure('presentation', token.item, surfaceRef.current);
    }
  }, []);
  const reconcile = useCallback(() => {
    const items = activeRef.current ? visible.current.filter(t => t.isViewable && t.item?.id) : [];
    const ids = new Set<string>(items.map(t => t.item.id));
    for (const [id, timer] of timers.current) {
      if (!ids.has(id)) { clearTimeout(timer); timers.current.delete(id); }
    }
    for (const token of items) {
      const venue = token.item as { id: string; name: string };
      if (timers.current.has(venue.id) || Date.now() - (lastSeen.current.get(venue.id) ?? 0) < 60_000) continue;
      timers.current.set(venue.id, setTimeout(() => {
        timers.current.delete(venue.id);
        if (!activeRef.current) return;
        lastSeen.current.set(venue.id, Date.now());
        recordVenueExposure('impression', venue, surfaceRef.current);
      }, 600));
    }
  }, []);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    visible.current = viewableItems;
    reconcile();
  }, [reconcile]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  const onPresentedChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    presented.current = viewableItems;
    present();
  }, [present]);
  useEffect(() => { present(); reconcile(); }, [active, present, reconcile]);
  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);
  return { onViewableItemsChanged, viewabilityConfig,
    presentationPair: { onViewableItemsChanged: onPresentedChanged, viewabilityConfig: presentationConfig } };
}
