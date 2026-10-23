import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { PANDA_PARTNER_ACTIVITY_API } from '@/constants/services';
import { createVenueActivityRecorder, venueActivityContext, type ActivityVenue, type VenueActivityInput, type VenueActivityType, type VenueActivitySurface, type VenueActivityContext } from './venue-activity';
export { venueActivityContext, withVenueActivityContext } from './venue-activity';

const recorder = createVenueActivityRecorder({
  endpoint: `${PANDA_PARTNER_ACTIVITY_API}/api/track`,
  platform: Platform.OS === 'web' ? 'website' : 'native',
  storage: AsyncStorage,
  send: (url, init) => fetch(url, init),
});
const report = (error: unknown) => console.warn('Venue activity remains pending for retry:', error);

export function recordVenueActivity(type: VenueActivityType, venue: ActivityVenue, context?: VenueActivityContext | VenueActivitySurface) {
  void recorder.record(type, venue, typeof context === 'string' ? venueActivityContext(venue, context) : context).catch(report);
}
export function recordVenueResults(events: VenueActivityInput[]) {
  void recorder.recordBatch(events).catch(report);
}
const queuedExposures: VenueActivityInput[] = [];
let exposureTimer: ReturnType<typeof setTimeout> | undefined;
const presentations = new Map<string, number>();
function flushExposures() {
  clearTimeout(exposureTimer); exposureTimer = undefined;
  if (queuedExposures.length) void recorder.recordBatch(queuedExposures.splice(0)).catch(report);
}
export function recordVenueExposure(type: 'presentation' | 'impression', venue: ActivityVenue, surface: VenueActivitySurface) {
  const context = venueActivityContext(venue, surface);
  if (type === 'presentation') {
    const now = Date.now(), key = `${surface}:${context.placement}:${venue.id}`;
    if (now - (presentations.get(key) ?? 0) < 60_000) return;
    if (presentations.size >= 2000) for (const [id, at] of presentations) if (now - at >= 60_000) presentations.delete(id);
    presentations.set(key, now);
  }
  queuedExposures.push({ type, venue, context });
  exposureTimer ??= setTimeout(flushExposures, 50);
}

export function startVenueActivityDelivery() {
  const flush = () => { void recorder.flush().catch(report); };
  flush();
  const subscription = AppState.addEventListener('change', (state) => {
    flushExposures();
    if (state === 'active') flush();
  });
  const interval = setInterval(() => {
    if (AppState.currentState === 'active') flush();
  }, 30_000);
  return () => { subscription.remove(); clearInterval(interval); };
}
