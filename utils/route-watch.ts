export type TransitRouteSnapshot = {
  venueId: string;
  lines: string;
  durationMinutes: number;
};

export type TransitRouteChange = {
  kind: 'lines' | 'duration';
  message: string;
};

export function describeTransitRouteChange(
  previous: TransitRouteSnapshot | null,
  next: TransitRouteSnapshot,
  destinationName: string,
  minimumDurationChange = 7,
): TransitRouteChange | null {
  if (!previous || previous.venueId !== next.venueId) return null;
  if (previous.lines !== next.lines) {
    return {
      kind: 'lines',
      message: `The route to ${destinationName} now uses ${next.lines}. It was ${previous.lines || 'a different route'}.`,
    };
  }
  const difference = Math.abs(previous.durationMinutes - next.durationMinutes);
  if (difference >= minimumDurationChange) {
    return {
      kind: 'duration',
      message: `The journey to ${destinationName} is now ${next.durationMinutes} minutes, a change of ${difference} minutes.`,
    };
  }
  return null;
}
