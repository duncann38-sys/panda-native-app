import type { Venue } from '@/data/venues';
import { decodeRoutePolyline } from './route-geometry';

export type PlannerWalkingLeg = { encoded: string; mode: 'walking'; durationMinutes: number; distanceMeters: number };

export async function loadPlannerWalkingRoute(
  stops: Venue[],
  apiBase: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<PlannerWalkingLeg[]> {
  if (stops.length < 2 || stops.length > 3 || stops.some((stop) =>
    !/^ChI[\w-]+$/.test(stop.id)
    || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)
    || Math.abs(stop.latitude!) > 90 || Math.abs(stop.longitude!) > 180,
  )) throw new Error('Valid Google venue coordinates are required for the route');

  return Promise.all(stops.slice(1).map(async (destination, index) => {
    const origin = stops[index];
    const response = await request(
      `${apiBase}/api/partner/venues/${encodeURIComponent(destination.id)}/walking`
      + `?latitude=${encodeURIComponent(origin.latitude!)}&longitude=${encodeURIComponent(origin.longitude!)}`,
      { signal },
    );
    if (!response.ok) throw new Error('Walking paths are unavailable');
    const data = await response.json() as Record<string, unknown>;
    if (!data || typeof data.polyline !== 'string' || decodeRoutePolyline(data.polyline).length < 2
      || typeof data.durationMinutes !== 'number' || !Number.isFinite(data.durationMinutes) || data.durationMinutes < 0
      || typeof data.distanceMeters !== 'number' || !Number.isFinite(data.distanceMeters) || data.distanceMeters < 0) {
      throw new Error('A verified walking path was not returned');
    }
    return { encoded: data.polyline, mode: 'walking' as const, durationMinutes: data.durationMinutes, distanceMeters: data.distanceMeters };
  }));
}
