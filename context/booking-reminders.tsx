import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './auth';
import { useSandboxReservations } from '@/hooks/useSandboxReservations';
import { useColors } from '@/hooks/useColors';
import { bookingCounts, bookingReminderPlan, type ReminderBooking } from '@/utils/booking-reminders';

const device = () => import('@/utils/booking-reminder-device');
type ReminderState = {
  ids: Set<string>; ready: boolean; error: string; count: number | null; countLabel: string;
  toggle: (booking: ReminderBooking, enabled: boolean) => Promise<void>;
  notificationsChanged: (enabled: boolean) => Promise<void>;
};
const Context = createContext<ReminderState | null>(null);

export function BookingRemindersProvider({ children }: { children: ReactNode }) {
  const { account, ready: authReady } = useAuth();
  const uid = account?.uid;
  const router = useRouter();
  const { history } = useSandboxReservations({ loadCapabilities: false });
  const [state, setState] = useState({ owner: '', ids: new Set<string>(), ready: false, error: '' });
  const refresh = useCallback(async (records?: ReminderBooking[]) => {
    if (Platform.OS === 'web' || !authReady || !uid) return;
    const d = await device();
    let error = '';
    try {
      if (!await d.bookingNotificationsEnabled(uid)) await d.bookingReminderDevice.clear(uid);
      else if (records) await d.bookingReminderDevice.sync(uid, records);
    } catch (e) { error = (e as Error).message || 'Reminders could not be updated.'; }
    const scheduled = await d.bookingReminderDevice.states(uid);
    const ids = new Set<string>();
    for (const b of records ?? history.data ?? []) {
      const key = await d.reminderKey(b.id);
      if (scheduled.some(n => n.booking === key)) ids.add(b.id);
    }
    setState({ owner: uid, ids, ready: true, error });
  }, [uid, authReady, history.data]);
  useEffect(() => {
    if (Platform.OS === 'web' || !authReady) return;
    let active = true;
    let stop: (() => void) | undefined;
    void device().then(async d => {
      if (!active) return;
      await d.bookingReminderDevice.setOwner(uid ?? null);
      if (uid && active) stop = d.listenForBookingReminders(uid, () => router.push('/bookings'));
    }).catch(() => { if (active && uid) setState(s => ({ ...s, owner: uid, ready: true, error: 'Booking reminders could not be loaded.' })); });
    return () => { active = false; stop?.(); };
  }, [uid, authReady, router]);
  useEffect(() => {
    if (!authReady || !uid || !history.isSuccess) return;
    void refresh(history.data).catch(() => setState(s => ({ ...s, owner: uid, ready: true, error: 'Booking reminders could not be loaded. Please reopen My bookings.' })));
    const listener = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh(history.data).catch(() => {});
    });
    return () => listener.remove();
  }, [uid, authReady, history.data, history.isSuccess, refresh]);
  const visible = state.owner === uid;
  const counts = bookingCounts(uid && history.isSuccess ? history.data : []);
  const toggle = async (booking: ReminderBooking, enabled: boolean) => {
    if (!uid || Platform.OS === 'web') throw new Error('Booking notifications need the Panda phone app.');
    const d = await device();
    if (enabled && !await d.bookingNotificationsEnabled(uid))
      throw new Error('Turn on Notifications in Profile settings first.');
    await d.bookingReminderDevice.set(uid, booking, enabled);
    await refresh(history.data);
  };
  const notificationsChanged = async (enabled: boolean) => {
    if (!uid || Platform.OS === 'web') return;
    const d = await device();
    if (!enabled) await d.bookingReminderDevice.clear(uid);
    await refresh(history.data);
  };
  return <Context.Provider value={{
    ids: visible ? state.ids : new Set(), ready: Platform.OS === 'web' || (visible && state.ready),
    error: visible ? state.error : '', toggle, notificationsChanged,
    count: uid && history.isSuccess ? counts.total : null,
    countLabel: !uid ? 'Sign in to see bookings' : history.isError ? 'Count unavailable · tap to retry'
      : history.isLoading ? 'Checking your bookings…' : counts.label,
  }}>{children}</Context.Provider>;
}

export function useBookingReminders() {
  const context = useContext(Context);
  if (!context) throw new Error('Booking reminders require their provider.');
  return context;
}

export function BookingReminderControl({ booking }: { booking: ReminderBooking }) {
  const reminders = useBookingReminders();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = reminders.ids.has(booking.id);
  let plan: ReturnType<typeof bookingReminderPlan> = [];
  let unavailable = '';
  try { plan = bookingReminderPlan(booking); } catch (e) { unavailable = (e as Error).message; }
  if (!enabled && !unavailable && !plan.length) return null;
  return <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 7 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', flex: 1 }}>Booking reminders</Text>
      <Switch testID={`booking-reminders-${booking.id}`} accessibilityLabel={`Booking reminders for ${booking.venueName}`}
        value={enabled} disabled={busy || !reminders.ready || Platform.OS === 'web' || (!!unavailable && !enabled)}
        trackColor={{ true: colors.green700 }} onValueChange={value => {
          if (busy) return;
          setBusy(true); setError('');
          void reminders.toggle(booking, value).catch(e => setError((e as Error).message)).finally(() => setBusy(false));
        }} />
    </View>
    <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
      {Platform.OS === 'web' ? 'Available in the Panda phone app.' : unavailable || (enabled
        ? 'Phone reminders enabled. Notifications open My bookings.'
        : 'Get a phone reminder one day before and two hours before.')}
    </Text>
    {!unavailable && plan.map(reminder => <Text key={reminder.kind} style={{ color: colors.mutedForeground, fontSize: 12 }}>
      {reminder.kind === 'day-before' ? 'Day before' : 'Two hours before'} · {new Date(reminder.at).toLocaleString('en-GB', { timeZone: booking.timeZone!, dateStyle: 'medium', timeStyle: 'short' })}
    </Text>)}
    {!unavailable && plan.length === 1 && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>The earlier reminder time has passed and will be skipped.</Text>}
    {!!(error || reminders.error) && <>
      <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>{error || reminders.error}</Text>
      {Platform.OS !== 'web' && <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setError('Open your phone settings and allow Panda notifications.')); }}>
        <Text style={{ color: colors.green700, paddingVertical: 8 }}>Open phone settings</Text>
      </Pressable>}
    </>}
  </View>;
}
