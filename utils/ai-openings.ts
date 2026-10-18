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
