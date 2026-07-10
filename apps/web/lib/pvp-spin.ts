import { easeSpinWithSoftLanding } from "@/lib/spin-ease";

export type PvpStripMetrics = {
  slotSize: number;
  slotGap: number;
  stripPaddingX: number;
  avatarSize: number;
};

/** Compact strip — matches open-room card height. */
export const PVP_STRIP_COMPACT: PvpStripMetrics = {
  slotSize: 40,
  slotGap: 8,
  stripPaddingX: 8,
  avatarSize: 36,
};

export const PVP_STRIP_DEFAULT: PvpStripMetrics = {
  slotSize: 56,
  slotGap: 12,
  stripPaddingX: 12,
  avatarSize: 48,
};

/** @deprecated use PVP_STRIP_COMPACT / metrics */
export const PVP_SLOT_SIZE = PVP_STRIP_COMPACT.slotSize;
export const PVP_SLOT_GAP = PVP_STRIP_COMPACT.slotGap;
export const PVP_SLOT_STEP = PVP_STRIP_COMPACT.slotSize + PVP_STRIP_COMPACT.slotGap;
export const PVP_STRIP_PADDING_X = PVP_STRIP_COMPACT.stripPaddingX;
export const PVP_LAND_CYCLE = 30;

export type SpinOffsets = {
  targetOffset: number;
};

export function computeSpinOffsets(
  winnerIndex: number,
  playerCount: number,
  viewportWidth: number,
  metrics: PvpStripMetrics = PVP_STRIP_COMPACT,
): SpinOffsets {
  const step = metrics.slotSize + metrics.slotGap;
  const landIndex = PVP_LAND_CYCLE * playerCount + winnerIndex;
  const centerOffset = viewportWidth / 2 - metrics.slotSize / 2 - metrics.stripPaddingX;
  const targetOffset = -(landIndex * step) + centerOffset;
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
