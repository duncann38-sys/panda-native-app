export type UberEstimateInput = {
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  driveDurationMinutes?: number | null;
  venueName: string;
};

export type UberEstimate = {
  minutes: number;
  minFare: number;
  maxFare: number;
  label: string;
  deepLink: string;
};

function isValidCoordinate(value: number | null | undefined, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * A free, local planning estimate from venue distance (or an explicitly
 * supplied driving duration). This is not a live Uber fare or route quote.
 */
export function buildUberEstimate(input: UberEstimateInput): UberEstimate | null {
  const { latitude, longitude, distanceMeters, driveDurationMinutes, venueName } = input;
  if (
    !isValidCoordinate(latitude, -90, 90)
    || !isValidCoordinate(longitude, -180, 180)
    || typeof distanceMeters !== 'number'
    || !Number.isFinite(distanceMeters)
    || distanceMeters <= 0
    || distanceMeters > 250_000
  ) {
    return null;
  }

  const distanceKm = distanceMeters / 1000;
  const suppliedDriveTime =
    typeof driveDurationMinutes === 'number'
    && Number.isFinite(driveDurationMinutes)
    && driveDurationMinutes > 0
    && driveDurationMinutes <= 180
      ? Math.round(driveDurationMinutes)
      : null;
  // Use an explicitly labelled driving duration when one exists. Otherwise
  // estimate from distance at a conservative urban average, without a route API.
  const minutes = Math.max(3, suppliedDriveTime ?? Math.round(3 + distanceKm * 3));

  // Broad local bands are deliberately indicative; Uber's live fare can differ.
  const minFare = Math.max(4, Math.floor(3.5 + distanceKm * 1.25 + minutes * 0.16));
  const maxFare = Math.max(minFare + 2, Math.ceil(5.25 + distanceKm * 1.85 + minutes * 0.27));
  const safeName = venueName.trim() || 'Panda venue';
  const deepLink = [
    'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
    `dropoff%5Blatitude%5D=${encodeURIComponent(String(latitude))}`,
    `dropoff%5Blongitude%5D=${encodeURIComponent(String(longitude))}`,
    `dropoff%5Bnickname%5D=${encodeURIComponent(safeName)}`,
  ].join('&');

  return {
    minutes,
    minFare,
    maxFare,
    label: `~${minutes} mins • £${minFare}–£${maxFare}`,
    deepLink,
  };
}
