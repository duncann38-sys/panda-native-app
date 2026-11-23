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

function validPlaceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/\s/.test(value);
}

export function isNewOpeningPrompt(text: string): boolean {
  return /\b(?:new restaurants?|new openings?|new & buzzing|new and buzzing|recently opened)\b/i.test(text);
}

/** A new-opening card needs dated external evidence, not just an AI description. */
export function hasDatedOpeningEvidence(venue: {
  id?: string;
  openingSourceName?: string;
  openingSourceUrl?: string;
  openingReportedAt?: string;
  openingDate?: string;
  openingDesignation?: string;
}, now = Date.now()): boolean {
  if (!venue.id || !/^ChI[\w-]+$/.test(venue.id) || !venue.openingSourceName?.trim()) return false;
  const reportedAt = Date.parse(venue.openingReportedAt ?? '');
  if (!Number.isFinite(reportedAt) || reportedAt > now) return false;
  // OpenTable's editorial New designation is not a claim that a venue opened
  // this calendar month. Keep the older dated-evidence contract for other sources.
  if (venue.openingDesignation === 'opentable-new') {
    if (venue.openingSourceName !== 'OpenTable' || now - reportedAt > 30 * 86_400_000) return false;
    try {
      const url = new URL(venue.openingSourceUrl ?? '');
      return url.protocol === 'https:' && !url.username && !url.password
        && ['www.opentable.co.uk', 'www.opentable.com', 'opentable.co.uk', 'opentable.com'].includes(url.hostname)
        && /^\/lists\/[^/]+$/.test(url.pathname) && !url.search && !url.hash;
    } catch { return false; }
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  const opened = venue.openingDate ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opened) || !Number.isFinite(Date.parse(opened))
    || new Date(opened).toISOString().slice(0, 10) !== opened
    || opened.slice(0, 7) !== today.slice(0, 7) || opened > today) return false;
  try {
    const url = new URL(venue.openingSourceUrl ?? '');
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
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
