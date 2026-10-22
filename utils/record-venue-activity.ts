import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { PANDA_PARTNER_ACTIVITY_API } from '@/constants/services';
import { createVenueActivityRecorder, type VenueActivityType, type VenueActivitySurface } from './venue-activity';

const recorder = createVenueActivityRecorder({
  endpoint: `${PANDA_PARTNER_ACTIVITY_API}/api/track`,
  platform: Platform.OS === 'web' ? 'website' : 'native',
  storage: AsyncStorage,
  send: (url, init) => fetch(url, init),
});
const report = (error: unknown) => console.warn('Venue activity remains pending for retry:', error);

export function recordVenueActivity(type: VenueActivityType, venue: { id: string; name: string }, surface?: VenueActivitySurface) {
  void recorder.record(type, venue, surface).catch(report);
}

export function startVenueActivityDelivery() {
  const flush = () => { void recorder.flush().catch(report); };
  flush();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') flush();
  });
  const interval = setInterval(() => {
    if (AppState.currentState === 'active') flush();
  }, 30_000);
  return () => { subscription.remove(); clearInterval(interval); };
}
