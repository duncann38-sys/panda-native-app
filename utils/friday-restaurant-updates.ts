export const RESTAURANT_UPDATES_TIME_ZONE = 'Europe/London';
export const RESTAURANT_UPDATES_SCHEDULE = 'Fridays at 9am London time';

/**
 * Scheduling primitive only. This does not request permission, subscribe a
 * customer or send a notification. Delivery must remain explicitly opt-in.
 */
export function nextFridayRestaurantUpdate(now: Date): Date {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid current time is required');
  const london = new Intl.DateTimeFormat('en-GB', {
    timeZone: RESTAURANT_UPDATES_TIME_ZONE,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let day = 0; day <= 7; day += 1) {
    // London 09:00 is UTC 08:00 in summer or UTC 09:00 in winter.
    for (const hour of [8, 9]) {
      const candidate = new Date(start + day * 86_400_000 + hour * 3_600_000);
      if (candidate.getTime() <= now.getTime()) continue;
      const parts = london.formatToParts(candidate);
      const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
      if (value('weekday') === 'Fri' && value('hour') === '09' && value('minute') === '00') return candidate;
    }
  }
  throw new Error('Could not resolve the next Friday morning in London');
}
