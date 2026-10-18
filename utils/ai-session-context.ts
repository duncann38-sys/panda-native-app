export type SessionVenueCard = {
  id?: string;
  name?: string;
  address?: string;
  fullAddress?: string;
  type?: string;
  rating?: number;
  price?: string;
  openNow?: boolean;
  todayHours?: string;
  nearest_station?: string;
  nearestStation?: string;
};

type SessionTransit = {
  venueId?: string;
  venue?: SessionVenueCard;
  destinationStation?: { name?: string };
};

export type SessionMessage = {
  role: 'user' | 'model';
  text: string;
  venues?: SessionVenueCard[];
  transit?: SessionTransit;
};

export type SessionVenueContext = {
  activeVenueId: string | null;
  recentVenues: SessionVenueCard[];
};

export type SessionVenueResolution = {
  isReference: boolean;
  ambiguous: boolean;
  venue: SessionVenueCard | null;
};

const MAX_SESSION_VENUES = 5;
const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;
const DEICTIC_VENUE_REFERENCE =
  /\b(?:that|this)\s+(?:place|venue|restaurant|pub|bar|cafe|café|spot|one)\b|\b(?:there|that one)\b|\b(?:near|at|to|from|around|outside|inside)\s+it\b/i;

export function isGooglePlaceSessionVenue(
  venue: { id?: string | null; source?: string | null } | null | undefined,
): boolean {
  return Boolean(
    venue
    && venue.source !== 'openstreetmap'
    && typeof venue.id === 'string'
    && GOOGLE_PLACE_ID_PATTERN.test(venue.id),
  );
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return result ? result.slice(0, maxLength) : undefined;
}

function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase('en-GB')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeVenue(
  venue: SessionVenueCard | null | undefined,
  nearestStation?: string,
): SessionVenueCard | null {
  if (!venue || typeof venue !== 'object') return null;
  const name = cleanText(venue.name, 160);
  if (!name) return null;

  const idCandidate = cleanText(venue.id, 256);
  const id = isGooglePlaceSessionVenue({ id: idCandidate }) ? idCandidate : undefined;
  const address = cleanText(venue.address ?? venue.fullAddress, 220);
  const type = cleanText(venue.type, 80);
  const price = cleanText(venue.price, 12);
  const todayHours = cleanText(venue.todayHours, 180);
  const station = cleanText(venue.nearest_station ?? venue.nearestStation ?? nearestStation, 160);
  const rating = typeof venue.rating === 'number'
    && Number.isFinite(venue.rating)
    && venue.rating >= 0
    && venue.rating <= 5
    ? venue.rating
    : undefined;

  return {
    ...(id ? { id } : {}),
    name,
    ...(address ? { address } : {}),
    ...(type ? { type } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(price ? { price } : {}),
    ...(typeof venue.openNow === 'boolean' ? { openNow: venue.openNow } : {}),
    ...(todayHours ? { todayHours } : {}),
    ...(station ? { nearest_station: station } : {}),
  };
}

function mentionedVenue(text: string, venues: SessionVenueCard[]): SessionVenueCard | null {
  const normalizedText = normalizeName(text);
  const matches = venues
    .filter((venue) => {
      const name = venue.name ? normalizeName(venue.name) : '';
      return name.length >= 3 && normalizedText.includes(name);
    })
    .sort((left, right) => (right.name?.length ?? 0) - (left.name?.length ?? 0));
  return matches[0] ?? null;
}

export function buildSessionVenueContext(
  messages: SessionMessage[],
  preferredVenue?: SessionVenueCard | null,
): SessionVenueContext {
  const stationByVenueId = new Map<string, string>();
  for (const message of messages) {
    const venueId = cleanText(message.transit?.venueId, 256);
    const station = cleanText(message.transit?.destinationStation?.name, 160);
    if (venueId && station) stationByVenueId.set(venueId, station);
  }

  const recentVenues: SessionVenueCard[] = [];
  const seen = new Set<string>();
  const addVenue = (candidate: SessionVenueCard | null | undefined) => {
    const normalized = normalizeVenue(
      candidate,
      candidate?.id ? stationByVenueId.get(candidate.id) : undefined,
    );
    if (!normalized) return;
    const key = normalized.id ?? normalizeName(normalized.name ?? '');
    if (!key || seen.has(key) || recentVenues.length >= MAX_SESSION_VENUES) return;
    seen.add(key);
    recentVenues.push(normalized);
  };

  addVenue(preferredVenue);
  for (let index = messages.length - 1; index >= 0 && recentVenues.length < MAX_SESSION_VENUES; index -= 1) {
    const message = messages[index];
    if (message.role !== 'model') continue;
    if (message.transit?.venue) addVenue(message.transit.venue);
    for (const venue of message.venues ?? []) addVenue(venue);
  }

  const preferred = preferredVenue ? normalizeVenue(preferredVenue) : null;
  if (preferred?.id && recentVenues.some((venue) => venue.id === preferred.id)) {
    return { activeVenueId: preferred.id, recentVenues };
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'model') continue;
    const messageVenueIds = (message.venues ?? [])
      .map((venue) => normalizeVenue(venue)?.id)
      .filter((id): id is string => Boolean(id));
    const transitVenueId = cleanText(message.transit?.venueId, 256);
    const activeByTransit = transitVenueId
      ? recentVenues.find((venue) => venue.id === transitVenueId)
      : null;
    if (activeByTransit?.id) return { activeVenueId: activeByTransit.id, recentVenues };

    const activeByMention = mentionedVenue(message.text, recentVenues);
    if (activeByMention?.id) return { activeVenueId: activeByMention.id, recentVenues };

    if (messageVenueIds.length === 1) {
      return { activeVenueId: messageVenueIds[0], recentVenues };
    }
    if (messageVenueIds.length > 1) break;
  }

  return { activeVenueId: null, recentVenues };
}

export function resolveSessionVenueReference(
  text: string,
  context: SessionVenueContext,
): SessionVenueResolution {
  const explicit = mentionedVenue(text, context.recentVenues);
  if (explicit) return { isReference: true, ambiguous: false, venue: explicit };

  if (!DEICTIC_VENUE_REFERENCE.test(text)) {
    return { isReference: false, ambiguous: false, venue: null };
  }

  const active = context.activeVenueId
    ? context.recentVenues.find((venue) => venue.id === context.activeVenueId) ?? null
    : null;
  if (active) return { isReference: true, ambiguous: false, venue: active };
  if (context.recentVenues.length === 1) {
    return { isReference: true, ambiguous: false, venue: context.recentVenues[0] };
  }
  return { isReference: true, ambiguous: true, venue: null };
}
