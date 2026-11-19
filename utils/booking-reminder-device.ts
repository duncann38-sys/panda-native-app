import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createBookingReminderScheduler, reminderFingerprint } from './booking-reminders';
import { createProfilePreferenceStorage, parseProfilePreferences } from './profile-preferences';
const KIND = 'panda-booking-reminder';
const CHANNEL = 'panda-booking-reminders';
const preferences = createProfilePreferenceStorage(
  { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync }, AsyncStorage, true,
);
export const reminderKey = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});
export const bookingReminderDevice = createBookingReminderScheduler({
  key: reminderKey,
  async list() {
    return (await Notifications.getAllScheduledNotificationsAsync())
      .filter(n => n.content.data?.kind === KIND)
      .map(n => ({
        id: n.identifier, owner: String(n.content.data.owner), booking: String(n.content.data.booking),
        fingerprint: String(n.content.data.fingerprint),
      }));
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.dismissNotificationAsync(id);
  },
  async permit(ask) {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Booking reminders', importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  },
  async schedule(id, owner, booking, b, reminder) {
    const test = b.environment === 'sandbox';
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: test ? 'Panda test booking reminder' : 'Your Panda booking',
        body: `${reminder.kind === 'day-before' ? 'Tomorrow' : 'In two hours'}: ${b.venueName}, ${b.startDateTime.slice(11)} (restaurant time), party of ${b.partySize}.${test ? ' Sandbox test only—not a real table.' : ''}`,
        sound: 'default',
        data: { kind: KIND, owner, booking, fingerprint: reminderFingerprint(b), route: '/bookings' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminder.at), channelId: CHANNEL },
    });
  },
});
export async function bookingNotificationsEnabled(uid: string) {
  return parseProfilePreferences(await preferences.read(uid)).notificationsEnabled;
}
export function listenForBookingReminders(uid: string, open: () => void) {
  let active = true;
  const handle = async (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data;
    if (!data || data.kind !== KIND) return;
    const owner = await reminderKey(uid);
    if (active && data.owner === owner) {
      open();
      await Notifications.clearLastNotificationResponseAsync();
    }
  };
  const listener = Notifications.addNotificationResponseReceivedListener(response => { void handle(response).catch(() => {}); });
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  return () => { active = false; listener.remove(); };
}
