export const PLANNER_FACT_TTL_MS = 3 * 60 * 60 * 1000;

/** Share pending work as well as successful facts; failed requests are retryable. */
export class PlannerResourceCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  private flights = new Map<string, Promise<T>>();
  private ttl: number;
  private now: () => number;
  constructor(ttl = PLANNER_FACT_TTL_MS, now = Date.now) {
    this.ttl = ttl;
    this.now = now;
  }

  expiresAt(key: string): number {
    return this.values.get(key)?.expires ?? 0;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expires > this.now()) return Promise.resolve(cached.value);
    if (cached) this.values.delete(key);
    const pending = this.flights.get(key);
    if (pending) return pending;
    const request = Promise.resolve().then(load).then(value => {
      this.values.delete(key);
      this.values.set(key, { value, expires: this.now() + this.ttl });
      while (this.values.size > 256) this.values.delete(this.values.keys().next().value!);
      return value;
    }).finally(() => {
      if (this.flights.get(key) === request) this.flights.delete(key);
    });
    this.flights.set(key, request);
    return request;
  }
}

export type PlannerSelection<T> = { key: string; plan: T[]; expires: number };

/** A Discovery page arriving must not restart a complete in-progress plan. */
export function stablePlannerSelection<T extends { id: string }>(
  previous: PlannerSelection<T> | null,
  key: string,
  proposed: T[],
  required: number,
  excluded: readonly string[],
  now = Date.now(),
): PlannerSelection<T> {
  if (previous?.key === key && previous.expires > now &&
      previous.plan.length === required && !previous.plan.some(venue => excluded.includes(venue.id))) {
    return previous;
  }
  return { key, plan: proposed, expires: now + PLANNER_FACT_TTL_MS };
}
