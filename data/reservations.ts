import type { Venue } from '@/data/venues';

const RESERVATIONS_URL = 'https://duncann38-sys.github.io/PANDA-DEMO/venues.json';
const STOP_WORDS = new Set([
  'the',
  'and',
  'restaurant',
  'restaurants',
  'bar',
  'cafe',
  'kitchen',
  'grill',
  'london',
  'co',
  'ltd',
]);

type ReservationSourceRecord = {
  name?: unknown;
  address?: unknown;
  fullAddress?: unknown;
  formattedAddress?: unknown;
  city?: unknown;
  location?: unknown;
  googlePlaceId?: unknown;
  google_place_id?: unknown;
  placeId?: unknown;
  place_id?: unknown;
  bookingUrl?: unknown;
  menuUrl?: unknown;
};

export type VenueReservation = {
  address: string;
  bookingUrl: string;
  city: string;
  menuUrl: string;
  nameKey: string;
  placeId: string;
};

let reservationRecordsPromise: Promise<VenueReservation[]> | null = null;

function text(value: unknown): string {
  return String(value || '')
    .toLocaleLowerCase('en-GB')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedName(value: unknown): string {
  return text(value)
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(' ');
}

function postcode(value: unknown): string {
  return String(value || '')
    .toLocaleUpperCase('en-GB')
    .match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/)?.[1]
    ?.replace(/\s/g, '') || '';
}

function normalizedAddress(value: unknown): string {
  return text(value)
    .replace(/\b(?:greater london|london|england|united kingdom|uk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function placeId(record: ReservationSourceRecord): string {
  const value = [
    record.googlePlaceId,
    record.google_place_id,
    record.placeId,
    record.place_id,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function sameAddress(first: string, second: string): boolean {
  const firstPostcode = postcode(first);
  const secondPostcode = postcode(second);
  if (firstPostcode || secondPostcode) {
    return Boolean(firstPostcode && secondPostcode && firstPostcode === secondPostcode);
  }
  const firstNormalized = normalizedAddress(first);
  const secondNormalized = normalizedAddress(second);
  return (
    firstNormalized.length >= 12
    && secondNormalized.length >= 12
    && (
      firstNormalized === secondNormalized
      || firstNormalized.includes(secondNormalized)
      || secondNormalized.includes(firstNormalized)
    )
  );
}

function sameCity(city: string, address: string): boolean {
  const normalizedCity = text(city);
  const normalizedVenueAddress = text(address);
  return Boolean(normalizedCity && normalizedVenueAddress && normalizedVenueAddress.includes(normalizedCity));
}

async function loadReservationRecords(): Promise<VenueReservation[]> {
  if (!reservationRecordsPromise) {
    reservationRecordsPromise = fetch(RESERVATIONS_URL, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Reservation feed unavailable');
        const payload = await response.json() as ReservationSourceRecord[] | { venues?: ReservationSourceRecord[] };
        const records = Array.isArray(payload) ? payload : payload.venues ?? [];
        return records.flatMap((record) => {
          if (!record?.name || !isHttpUrl(record.bookingUrl)) return [];
          return [{
            address: String(record.address || record.fullAddress || record.formattedAddress || ''),
            bookingUrl: record.bookingUrl,
            city: String(record.city || record.location || ''),
            menuUrl: isHttpUrl(record.menuUrl) ? record.menuUrl : '',
            nameKey: normalizedName(record.name),
            placeId: placeId(record),
          }];
        });
      })
      .catch((error) => {
        reservationRecordsPromise = null;
        throw error;
      });
  }
  return reservationRecordsPromise;
}

export async function reservationForVenue(venue: Venue): Promise<VenueReservation | null> {
  const records = await loadReservationRecords();
  const venueId = venue.id.trim();
  if (venueId) {
    const byPlaceId = records.filter((record) => record.placeId === venueId);
    if (byPlaceId.length === 1) return byPlaceId[0];
  }

  const nameKey = normalizedName(venue.name);
  if (!nameKey) return null;
  const byName = records.filter((record) => record.nameKey === nameKey);
  const byNameAndAddress = byName.filter((record) => sameAddress(venue.fullAddress, record.address));
  if (byNameAndAddress.length === 1) return byNameAndAddress[0];
  const byNameAndCity = byName.filter((record) => !record.city || sameCity(record.city, venue.fullAddress));
  if (byNameAndCity.length === 1) return byNameAndCity[0];
  return byName.length === 1 && (!byName[0].city || !venue.fullAddress) ? byName[0] : null;
}