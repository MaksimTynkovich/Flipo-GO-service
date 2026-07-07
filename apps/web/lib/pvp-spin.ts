import { easeSpinWithSoftLanding } from "@/lib/spin-ease";

const SLOT_SIZE = 44;
const SLOT_GAP = 10;
export const PVP_SLOT_STEP = SLOT_SIZE + SLOT_GAP;
export const PVP_LAND_CYCLE = 30;

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

export function spinOffsetAtTime(t: number, targetOffset: number): number {
  return targetOffset * easeSpinWithSoftLanding(clamp01(t));
}

export function spinTimeProgress(nowMs: number, spinAtMs: number, spinEndsAtMs: number): number {
  const totalDuration = spinEndsAtMs - spinAtMs;
  if (totalDuration <= 0) return 1;
  return clamp01((nowMs - spinAtMs) / totalDuration);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
