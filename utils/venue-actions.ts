import type { Venue } from '@/data/venues';

export function distanceBetween(
  first: { latitude?: number | null; longitude?: number | null },
  second: { latitude?: number | null; longitude?: number | null },
) {
  if (![first.latitude, first.longitude, second.latitude, second.longitude].every(Number.isFinite)) return null;
  if ([first.latitude, second.latitude].some(value => Math.abs(value!) > 90) ||
    [first.longitude, second.longitude].some(value => Math.abs(value!) > 180)) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const lat = radians(second.latitude! - first.latitude!);
  const lng = radians(second.longitude! - first.longitude!);
  const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(first.latitude!)) *
    Math.cos(radians(second.latitude!)) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Keep paid placements visible without replacing nearby organic results. */
export function interleavePromotions(source: Venue[]) {
  const organic = source.filter(venue => !venue.promoted);
  const promoted = source.filter(venue => venue.promoted);
  if (!organic.length) return promoted;
  const result: Venue[] = [];
  const interval = Math.max(1, Math.floor(organic.length / (promoted.length + 1)));
  let promotedIndex = 0;
  for (let index = 0; index < organic.length; index += 1) {
    const venue = organic[index];
    result.push(venue);
    if (promotedIndex < promoted.length && (index + 1) % interval === 0) {
      result.push(promoted[promotedIndex++]);
    }
  }
  return [...result, ...promoted.slice(promotedIndex)];
}
