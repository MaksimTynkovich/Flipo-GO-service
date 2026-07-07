const SLOT_SIZE = 44;
const SLOT_GAP = 10;
export const PVP_SLOT_STEP = SLOT_SIZE + SLOT_GAP;
export const PVP_LAND_CYCLE = 12;

/**
 * Higher value = more distance covered early, longer slow crawl at the end.
 * Velocity decreases smoothly from start to zero (no flat-speed phase).
 */
const DECEL_RATE = 6.5;

export type SpinOffsets = {
  targetOffset: number;
};

export function computeSpinOffsets(
  winnerIndex: number,
  playerCount: number,
  viewportWidth: number,
): SpinOffsets {
  const landIndex = PVP_LAND_CYCLE * playerCount + winnerIndex;
  const centerOffset = viewportWidth / 2 - SLOT_SIZE / 2;
  const targetOffset = -(landIndex * PVP_SLOT_STEP) + centerOffset;
  return { targetOffset };
}

/**
 * Exponential ease-out: fast at the beginning, monotonically slowing until full stop.
 * Analogous to friction — speed is always proportional to remaining distance.
 */
function spinEase(t: number): number {
  const progress = clamp01(t);
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return (1 - Math.exp(-DECEL_RATE * progress)) / (1 - Math.exp(-DECEL_RATE));
}

export function spinOffsetAtTime(t: number, targetOffset: number): number {
  return targetOffset * spinEase(t);
}

export function spinTimeProgress(nowMs: number, spinAtMs: number, spinEndsAtMs: number): number {
  const duration = spinEndsAtMs - spinAtMs;
  if (duration <= 0) return 1;
  return clamp01((nowMs - spinAtMs) / duration);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
