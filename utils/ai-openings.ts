export type OpeningRotationState = {
  seenPlaceIds: string[];
  rotation: number;
};

export const OPENING_ROTATION_STORAGE_KEY = 'panda.ai.new-openings.rotation.v1';
export const EMPTY_OPENING_ROTATION_STATE: OpeningRotationState = {
  seenPlaceIds: [],
  rotation: 0,
};

const MAX_REMEMBERED_OPENINGS = 120;
const OPENING_LOOKBACK_MONTHS = 3;

function openingWindowStart(now: number): number {
  const current = new Date(now);
  return Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - OPENING_LOOKBACK_MONTHS, 1, 12, 0, 0);
}

function validPlaceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/\s/.test(value);
}

export function isNewOpeningPrompt(text: string): boolean {
  return /\b(?:new restaurants?|new openings?|new & buzzing|new and buzzing|recently opened)\b/i.test(text);
}

/** A card is shown only for a recent, dated opening with a publisher source or an explicit Google verification link. */
export function hasDatedOpeningEvidence(venue: {
  id?: string;
  openingSourceName?: string;
  openingSourceUrl?: string;
  openingReportedAt?: string;
  openingDate?: string;
  openingDesignation?: string;
}, now = Date.now()): boolean {
  if (!venue.id || !/^ChI[\w-]+$/.test(venue.id)
    || !['panda-verified-new', 'panda-search-reported-new'].includes(venue.openingDesignation ?? '')
    || !venue.openingSourceName?.trim()) return false;
  const reportedAt = Date.parse(venue.openingReportedAt ?? '');
  if (!Number.isFinite(reportedAt) || reportedAt > now || now - reportedAt > 8 * 86_400_000) return false;
  const opened = venue.openingDate ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opened)) return false;
  const openedAt = Date.parse(opened + 'T12:00:00Z');
  if (!Number.isFinite(openedAt) || openedAt > now || openedAt < openingWindowStart(now)
    || new Date(openedAt).toISOString().slice(0, 10) !== opened) return false;
  try {
    const url = new URL(venue.openingSourceUrl ?? '');
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    if (venue.openingDesignation === 'panda-search-reported-new') {
      return url.hostname === 'www.google.com' && url.pathname === '/search' && Boolean(url.searchParams.get('q'));
    }
    return !/(^|\.)google\.[a-z.]+$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function parseOpeningRotationState(raw: string | null): OpeningRotationState {
  if (!raw) return { ...EMPTY_OPENING_ROTATION_STATE };

  try {
    const value = JSON.parse(raw) as Partial<OpeningRotationState>;
    const seenPlaceIds = Array.isArray(value.seenPlaceIds)
      ? [...new Set(value.seenPlaceIds.filter(validPlaceId))].slice(-MAX_REMEMBERED_OPENINGS)
      : [];
    const rotation =
      typeof value.rotation === 'number' && Number.isSafeInteger(value.rotation) && value.rotation >= 0
        ? value.rotation
        : 0;
    return { seenPlaceIds, rotation };
  } catch {
    return { ...EMPTY_OPENING_ROTATION_STATE };
  }
}

export function advanceOpeningRotation(state: OpeningRotationState): OpeningRotationState {
  return {
    seenPlaceIds: [...state.seenPlaceIds],
    rotation: state.rotation + 1,
  };
}

export function rememberShownOpenings(
  state: OpeningRotationState,
  placeIds: unknown[],
): OpeningRotationState {
  const seenPlaceIds = [...new Set([
    ...state.seenPlaceIds,
    ...placeIds.filter(validPlaceId),
  ])].slice(-MAX_REMEMBERED_OPENINGS);
  return { seenPlaceIds, rotation: state.rotation };
}
