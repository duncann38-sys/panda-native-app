export type ReminderBooking = {
  id: string; status: string; startDateTime: string; timeZone: string | null;
  venueName: string; partySize: number; environment: string;
};
export type ReminderKind = 'day-before' | 'two-hours';
export type BookingReminder = { kind: ReminderKind; at: number };
function localStamp(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
}
export function restaurantInstant(local: string, timeZone: string | null): number {
  if (!timeZone) throw new Error('The restaurant timezone is missing. Panda cannot safely schedule this reminder yet.');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error('The booking time could not be verified.');
  const wanted = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (new Date(wanted).toISOString().slice(0, 16) !== local) throw new Error('The booking time is invalid.');
  let candidate = wanted;
  try {
    for (let i = 0; i < 4; i++) candidate += wanted - localStamp(new Date(candidate), timeZone);
    if (localStamp(new Date(candidate), timeZone) !== wanted) throw new Error();
    if ([-3_600_000, 3_600_000].some(offset => localStamp(new Date(candidate + offset), timeZone) === wanted))
      throw new Error();
  } catch {
    throw new Error('The restaurant timezone or clock-change time needs verification before reminders can be set.');
  }
  return candidate;
}
export function bookingReminderPlan(booking: ReminderBooking, now = Date.now()): BookingReminder[] {
  if (booking.status !== 'confirmed') return [];
  const start = restaurantInstant(booking.startDateTime, booking.timeZone);
  if (start <= now) return [];
  const previousDay = new Date(`${booking.startDateTime}:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return [
    { kind: 'day-before' as const, at: restaurantInstant(previousDay.toISOString().slice(0, 16), booking.timeZone) },
    { kind: 'two-hours' as const, at: start - 2 * 3_600_000 },
  ].filter(reminder => reminder.at > now);
}
export function bookingCounts(bookings: ReminderBooking[]) {
  const confirmed = [...new Map(bookings.filter(b => b.status === 'confirmed').map(b => [b.id, b])).values()];
  const tests = confirmed.filter(b => b.environment === 'sandbox').length;
  const real = confirmed.length - tests;
  const label = tests
    ? `${real} real booking${real === 1 ? '' : 's'} · ${tests} test${tests === 1 ? '' : 's'}`
    : `${real} confirmed booking${real === 1 ? '' : 's'}`;
  return { total: confirmed.length, real, tests, label };
}
export type ScheduledBookingReminder = { id: string; owner: string; booking: string; fingerprint: string };
type Adapter = {
  key: (value: string) => Promise<string>;
  list: () => Promise<ScheduledBookingReminder[]>;
  cancel: (id: string) => Promise<void>;
  permit: (ask: boolean) => Promise<boolean>;
  schedule: (id: string, owner: string, bookingKey: string, booking: ReminderBooking, reminder: BookingReminder) => Promise<void>;
};
export const reminderFingerprint = (booking: ReminderBooking) =>
  `${booking.startDateTime}|${booking.timeZone}|${booking.partySize}|${booking.venueName}|${booking.environment}`;
export function createBookingReminderScheduler(adapter: Adapter) {
  let active: string | null = null;
  let revision = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T,>(run: () => Promise<T>) => {
    const task = tail.catch(() => {}).then(run);
    tail = task;
    return task;
  };
  const cancel = async (items: ScheduledBookingReminder[]) => {
    for (const item of items) await adapter.cancel(item.id);
  };
  async function replace(uid: string, b: ReminderBooking, enabled: boolean, ask: boolean) {
    const version = revision;
    const check = () => { if (active !== uid || revision !== version) throw new Error('Please sign in again before changing reminders.'); };
    check();
    const owner = await adapter.key(uid), booking = await adapter.key(b.id);
    check();
    const existing = (await adapter.list()).filter(n => n.owner === owner && n.booking === booking);
    if (!enabled) { await cancel(existing); return; }
    const plan = bookingReminderPlan(b);
    if (!plan.length) throw new Error('Both reminder times have already passed.');
    if (!await adapter.permit(ask)) throw new Error('Allow notifications in your phone settings to receive booking reminders.');
    check();
    await cancel(existing);
    const created: string[] = [];
    try {
      for (const reminder of plan) {
        check();
        const id = `panda-booking-${owner}-${booking}-${reminder.kind}`;
        created.push(id);
        await adapter.schedule(id, owner, booking, b, reminder);
      }
      check();
    } catch (error) {
      for (const id of created) await adapter.cancel(id);
      throw error;
    }
  }
  return {
    setOwner(uid: string | null) {
      if (active !== uid) { active = uid; revision++; }
      return serial(async () => {
        const owner = uid ? await adapter.key(uid) : null;
        await cancel((await adapter.list()).filter(n => n.owner !== owner));
      });
    },
    set(uid: string, b: ReminderBooking, enabled: boolean) {
      return serial(() => replace(uid, b, enabled, true));
    },
    clear(uid: string) {
      return serial(async () => {
        const owner = await adapter.key(uid);
        await cancel((await adapter.list()).filter(n => n.owner === owner));
      });
    },
    sync(uid: string, records: ReminderBooking[]) {
      return serial(async () => {
        if (active !== uid) return;
        const owner = await adapter.key(uid);
        const scheduled = (await adapter.list()).filter(n => n.owner === owner);
        const byKey = new Map(await Promise.all(records.map(async b => [await adapter.key(b.id), b] as const)));
        for (const key of new Set(scheduled.map(n => n.booking))) {
          if (active !== uid) return;
          const b = byKey.get(key), items = scheduled.filter(n => n.booking === key);
          if (!b || b.status !== 'confirmed') await cancel(items);
          else if (items.some(n => n.fingerprint !== reminderFingerprint(b))) {
            await cancel(items);
            if (bookingReminderPlan(b).length) await replace(uid, b, true, false);
          }
        }
      });
    },
    states(uid: string) {
      return serial(async () => {
        if (active !== uid) return [] as ScheduledBookingReminder[];
        const owner = await adapter.key(uid);
        return (await adapter.list()).filter(n => n.owner === owner);
      });
    },
  };
}
