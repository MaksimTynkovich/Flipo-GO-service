const SLOT_SIZE = 44;
const SLOT_GAP = 10;
export const PVP_SLOT_STEP = SLOT_SIZE + SLOT_GAP;
export const PVP_LAND_CYCLE = 30;
export const PVP_REVEAL_DELAY_MS = 1000;

const DECEL_POWER = 5.4;

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
 * One stable profile for the whole spin:
 * fast start, then continuous smooth deceleration until stop.
 */
export function spinOffsetAtTime(t: number, targetOffset: number): number {
  const progress = clamp01(t);
  const eased = 1 - (1 - progress) ** DECEL_POWER;
  return targetOffset * eased;
}

export function spinTimeProgress(nowMs: number, spinAtMs: number, spinEndsAtMs: number): number {
  const totalDuration = spinEndsAtMs - spinAtMs;
  const animationDuration = Math.max(0, totalDuration - PVP_REVEAL_DELAY_MS);
  if (animationDuration <= 0) return 1;
  return clamp01((nowMs - spinAtMs) / animationDuration);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
