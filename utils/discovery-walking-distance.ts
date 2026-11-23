export const ESTIMATED_WALKING_METERS_PER_MINUTE = 80;
export const ONE_HOUR_WALKING_RADIUS_METERS = 60 * ESTIMATED_WALKING_METERS_PER_MINUTE;
export const ONE_HOUR_WALKING_RADIUS_KM = ONE_HOUR_WALKING_RADIUS_METERS / 1000;
export const CATEGORY_DISCOVERY_EXPANSION_RINGS_KM = [2, ONE_HOUR_WALKING_RADIUS_KM] as const;

export function isWithinOneHourWalkingRadius(distanceMeters: number): boolean {
  return Number.isFinite(distanceMeters)
    && distanceMeters >= 0
    && distanceMeters <= ONE_HOUR_WALKING_RADIUS_METERS;
}

export function estimatedWalkingMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / ESTIMATED_WALKING_METERS_PER_MINUTE));
}
