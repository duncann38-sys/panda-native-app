export type VenueActivityType = 'result_returned' | 'presentation' | 'impression' | 'detail_open' | 'menu_click' | 'booking_click' | 'directions_click' | 'call_click' | 'photo_click' | 'save_click';
export type VenueActivitySurface = 'discovery' | 'banging' | 'panda_ai' | 'map' | 'planner' | 'saved';
export type VenueActivityContext = { surface?: VenueActivitySurface; placement?: 'suggestions' | 'promoted_discovery' | 'banging' | 'other' };
export type ActivityVenue = { id: string; name: string; promoted?: boolean; premium?: boolean; activityContext?: VenueActivityContext };
type ActivityEvent = { eventId: string; type: VenueActivityType; venueId: string; venue: string; ts: number; platform: 'native' | 'website'; surface?: VenueActivitySurface; placement?: VenueActivityContext['placement']; trackingVersion?: number };
export type VenueActivityInput = { type: VenueActivityType; venue: ActivityVenue; context?: VenueActivityContext | VenueActivitySurface };
export function venueActivityContext(venue: ActivityVenue, surface: VenueActivitySurface): VenueActivityContext {
  return { surface, placement: surface === 'banging' ? 'banging' : surface === 'discovery'
    ? venue.promoted || venue.premium ? 'promoted_discovery' : 'suggestions' : 'other' };
}
export function withVenueActivityContext<T extends ActivityVenue>(venue: T, surface: VenueActivitySurface) {
  return { ...venue, activityContext: venueActivityContext(venue, surface) };
}
const KEY = 'panda_venue_activity_pending_v1';
const TYPES = new Set<VenueActivityType>(['result_returned', 'presentation', 'impression', 'detail_open', 'menu_click', 'booking_click', 'directions_click', 'call_click', 'photo_click', 'save_click']);
/** Count list membership, not photo/detail fetches or React rerenders.
 * Pagination adds only new IDs; a new query or visit starts a new result set.
 */
export function createVenueResultTracker() {
  let lastScope: string | undefined;
  let listed = new Set<string>();
  return {
    reset() { lastScope = undefined; listed.clear(); },
    capture(venues: ActivityVenue[], surface: VenueActivitySurface, scope: string): VenueActivityInput[] {
      if (scope !== lastScope) { listed.clear(); lastScope = scope; }
      const events: VenueActivityInput[] = [];
      for (const venue of venues) {
        if (!venue.id) continue;
        const context = venueActivityContext(venue, surface);
        const key = `${venue.id}:${context.placement}`;
        if (listed.has(key)) continue;
        listed.add(key);
        events.push({ type: 'result_returned', venue, context });
      }
      return events;
    },
  };
}
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
  let delivery: Promise<void> | null = null;
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
    if (delivery) return delivery;
    delivery = (async () => {
    while (true) {
      const batch = await run(async () => {
        await load();
        return pending!.slice(0, 100);
      });
      if (!batch.length) return;
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
      await run(async () => {
        pending!.splice(0, batch.length);
        await persist();
      });
    }
    })().finally(() => { delivery = null; });
    return delivery;
  }
  function run<T>(operation: () => Promise<T>) {
    const result = chain.then(operation);
    chain = result.then(() => {}, () => {});
    return result;
  }
  return {
    record(type: VenueActivityType, venue: ActivityVenue, context?: VenueActivityContext | VenueActivitySurface) {
      if (!venue.id || !TYPES.has(type)) return Promise.resolve();
      // Capture the tap time, not the later retry time.
      const event: ActivityEvent = {
        eventId: eventId(), type, venueId: venue.id, venue: venue.name, ts: Date.now(), platform: options.platform,
        ...(typeof context === 'string' ? { surface: context } : context ?? venue.activityContext ?? {}),
        trackingVersion: 2,
      };
      return run(async () => {
        await load();
        pending!.push(event);
        await persist();
      }).then(deliver);
    },
    recordBatch(inputs: VenueActivityInput[]) {
      const events = inputs.filter(({ type, venue }) => venue.id && TYPES.has(type)).map(({ type, venue, context }) => ({
        eventId: eventId(), type, venueId: venue.id, venue: venue.name, ts: Date.now(), platform: options.platform,
        ...(typeof context === 'string' ? { surface: context } : context ?? venue.activityContext ?? {}), trackingVersion: 2,
      }));
      if (!events.length) return Promise.resolve();
      return run(async () => { await load(); pending!.push(...events); await persist(); }).then(deliver);
    },
    flush: () => run(load).then(deliver),
  };
}
