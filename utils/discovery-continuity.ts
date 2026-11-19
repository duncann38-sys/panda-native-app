/** Keep only the most recent category tap while a serial request is busy. */
export class LatestDiscoverySelection<T> {
  private pending: T | null = null;
  request(value: T) { this.pending = value; }
  clear() { this.pending = null; }
  take(blocked: boolean): T | null {
    if (blocked) return null;
    const value = this.pending;
    this.pending = null;
    return value;
  }
}

export function shouldFillDiscovery(input: {
  count: number; busy: boolean; hasCursor: boolean; exhausted: boolean;
  attempts: number; retryAt: number; now?: number; providerPage?: boolean;
}) {
  // WAP renders page one, then warms the next two provider pages. Do not
  // automatically scan every distance ring just to meet an arbitrary count.
  const warmProviderPages = input.providerPage === true && input.attempts < 2;
  return (input.count < 8 || warmProviderPages) && !input.busy && input.hasCursor && !input.exhausted
    && input.attempts < 3 && (input.now ?? Date.now()) >= input.retryAt;
}
