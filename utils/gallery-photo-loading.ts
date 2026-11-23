/**
 * Keep the current slide and its immediate neighbours ready without requesting
 * an entire paid photo gallery when someone opens a venue.
 * This does not shorten the gallery or change the available swipe positions.
 */
export function shouldLoadGalleryPhoto(index: number, activeIndex: number): boolean {
  return Math.abs(index - activeIndex) <= 1;
}
