export type UberEstimateInput = {
  latitude?: number | null;
  longitude?: number | null;
  distanceMeters?: number | null;
  driveDurationMinutes?: number | null;
  venueName: string;
  now?: Date;
  timeZone?: string;
};

export type UberEstimate = {
  minutes: number;
  minFare: number;
  maxFare: number;
  peakSurcharge: number;
  label: string;
  deepLink: string;
};

export function isUberRideRequest(text: string): boolean {
  return /\b(?:uber|taxi|cab)\b/i.test(String(text || ''))
    && /\b(?:to|home|ride|journey|fare|price|estimate|get|book|order|call|take)\b/i.test(String(text || ''));
}

export function isUberHomeRequest(text: string): boolean {
  return isUberRideRequest(text) && /\bhome\b/i.test(String(text || ''));
}

function isPeakPickupTime(now: Date, timeZone?: string): boolean {
  try {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    if (!Number.isFinite(hour) || weekday === 'Sat' || weekday === 'Sun') return false;
    return (hour >= 7 && hour < 10) || (hour >= 16 && hour < 19);
  } catch {
    return false;
  }
}

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
  const peakSurcharge = isPeakPickupTime(input.now ?? new Date(), input.timeZone) ? 5 : 0;
  const baseMinFare = Math.max(4, Math.floor(3.5 + distanceKm * 1.25 + minutes * 0.16));
  const baseMaxFare = Math.max(baseMinFare + 2, Math.ceil(5.25 + distanceKm * 1.85 + minutes * 0.27));
  const minFare = baseMinFare + peakSurcharge;
  const maxFare = baseMaxFare + peakSurcharge;
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
    peakSurcharge,
    label: `~${minutes} mins • £${minFare}–£${maxFare}`,
    deepLink,
  };
}
