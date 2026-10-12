export type VenueActivityType = 'detail_open' | 'menu_click' | 'booking_click' | 'directions_click' | 'call_click';
type ActivityVenue = { id: string; name: string };
type ActivityEvent = { eventId: string; type: VenueActivityType; venueId: string; venue: string; ts: number; platform: 'native' | 'website' };
const KEY = 'panda_venue_activity_pending_v1';
const TYPES = new Set<VenueActivityType>(['detail_open', 'menu_click', 'booking_click', 'directions_click', 'call_click']);
function eventId() {
  return `panda-${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(13, '0')}-${Math.random().toString(36).slice(2).padEnd(13, '0')}`;
}

/** A persistent outbox. Only a confirmed write removes pending taps. */
export function createVenueActivityRecorder(options: {
  endpoint: string;
  platform: 'native' | 'website';
  storage: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
  send: (url: string, init: RequestInit) => Promise<Response>;
}) {
  let pending: ActivityEvent[] | null = null;
  let chain = Promise.resolve();
  const persist = () => options.storage.setItem(KEY, JSON.stringify(pending));
  async function load() {
    if (pending !== null) return;
    const stored = await options.storage.getItem(KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) throw new Error('Invalid pending venue activity');
    pending = parsed.filter((event): event is ActivityEvent => event && TYPES.has(event.type)
      && typeof event.venueId === 'string' && Boolean(event.venueId)
      && typeof event.ts === 'number' && Number.isFinite(event.ts));
    pending = pending.map(event => ({ ...event, eventId: event.eventId || eventId() }));
    await persist();
  }
  async function deliver() {
    while (pending?.length) {
      const batch = pending.slice(0, 100);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let response: Response;
      try {
        response = await options.send(options.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }), keepalive: true,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`Venue activity delivery failed (${response.status})`);
      const result = await response.json();
      if (result.ok !== true || result.stored !== batch.length) {
        throw new Error('Venue activity storage was not confirmed');
      }
      pending.splice(0, batch.length);
      await persist();
    }
  }
  function run(operation: () => Promise<void>) {
    const result = chain.then(operation);
    chain = result.catch(() => {});
    return result;
  }
  return {
    record(type: VenueActivityType, venue: ActivityVenue) {
      if (!venue.id || !TYPES.has(type)) return Promise.resolve();
      // Capture the tap time, not the later retry time.
      const event: ActivityEvent = {
        eventId: eventId(), type, venueId: venue.id, venue: venue.name, ts: Date.now(), platform: options.platform,
      };
      return run(async () => {
        await load();
        pending!.push(event);
        await persist();
        await deliver();
      });
    },
    flush: () => run(async () => { await load(); await deliver(); }),
  };
}
