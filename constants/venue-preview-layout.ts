export const VENUE_PREVIEW_CARD_HEIGHT = 250;
export const VENUE_PREVIEW_PHOTO_HEIGHT = 100;
export const VENUE_PREVIEW_CARD_MAX_WIDTH = 194;
export const VENUE_PREVIEW_CARD_MIN_WIDTH = 174;
export const VENUE_PREVIEW_CARD_GAP = 10;
export const VENUE_PREVIEW_SIDE_PADDING = 16;

export function venuePreviewCardWidth(viewportWidth: number) {
  const available = Number.isFinite(viewportWidth) ? viewportWidth - 156 : VENUE_PREVIEW_CARD_MIN_WIDTH;
  return Math.min(
    VENUE_PREVIEW_CARD_MAX_WIDTH,
    Math.max(VENUE_PREVIEW_CARD_MIN_WIDTH, available),
  );
}
