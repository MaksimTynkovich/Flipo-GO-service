export const PVP_HIGHLIGHT_RANGE = 1.45;

export function highlightStrengthForDistance(distance: number, range = PVP_HIGHLIGHT_RANGE): number {
  if (distance >= range) return 0;
  const t = 1 - distance / range;
  return t * t * (3 - 2 * t);
}

export function highlightStrengthAtIndex(index: number, centerPosition: number): number {
  return highlightStrengthForDistance(Math.abs(index - centerPosition));
}
