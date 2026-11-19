export function bangingDrawerLayout(headerHeight: number, cardHeight: number, closedHeight = 44) {
  const header = Number.isFinite(headerHeight) && headerHeight > 0 ? Math.ceil(headerHeight) : 64;
  const card = Number.isFinite(cardHeight) && cardHeight > 0 ? Math.ceil(cardHeight) : 300;
  const carouselHeight = card + 8;
  const height = header + carouselHeight;
  return { height, carouselHeight, closedOffset: Math.max(0, height - closedHeight) };
}
