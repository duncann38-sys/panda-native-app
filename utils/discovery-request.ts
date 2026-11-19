/** One cancellable foreground lane. Abandoned replies must never change the feed. */
export class DiscoveryRequestLane {
  private current: AbortController | null = null;
  begin(): AbortController {
    this.cancel();
    const request = new AbortController();
    this.current = request;
    return request;
  }
  cancel() { this.current?.abort(); }
  isCurrent(request: AbortController) {
    return this.current === request && !request.signal.aborted;
  }
  finish(request: AbortController) {
    if (this.current === request) this.current = null;
  }
}

/** Keep the provider deadline, but let a later category tap interrupt it immediately. */
export function discoveryDeadline(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', abort);
    },
  };
}
