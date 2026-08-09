/** x50 рулетка: 50 секторов — blue×2, red×2, green×5, yellow×50 */

import { easeSpinWithSoftLanding } from "@/lib/spin-ease";

export const ROULETTE_COLORS = ["blue", "red", "green", "yellow"] as const;
export type RouletteColor = (typeof ROULETTE_COLORS)[number];

/** Must match apps/api provablyfair.WheelColors exactly (interleaved). */
export const WHEEL_COLORS = [
  "yellow", "blue", "red", "green", "blue", "red", "blue", "red", "green", "blue",
  "red", "blue", "red", "green", "blue", "red", "blue", "red", "green", "blue",
  "red", "blue", "red", "green", "blue", "red", "blue", "red", "green", "blue",
  "red", "blue", "red", "green", "blue", "red", "blue", "red", "green", "blue",
  "red", "blue", "red", "green", "blue", "red", "blue", "red", "blue", "red",
] as const satisfies readonly RouletteColor[];

export const WHEEL_ORDER = WHEEL_COLORS.map((_, i) => i);

export const ROULETTE_SEGMENTS = WHEEL_ORDER.length;
export const SEGMENT_ANGLE = 360 / ROULETTE_SEGMENTS;
export const SPIN_DURATION_MS = 12_000;
export const RESULT_PAUSE_MS = 0;
export const RESULT_DISPLAY_MS = 3_000;
export const SEGMENT_JITTER_RATIO = 0.38;

export const POINTER_ANGLE_DEG = -90;

export function jitterForRound(roundId: string): number {
  let hash = 0;
  for (let i = 0; i < roundId.length; i++) {
    hash = (hash * 31 + roundId.charCodeAt(i)) | 0;
  }
  const t = (Math.abs(hash) % 1000) / 1000;
  const max = SEGMENT_ANGLE * SEGMENT_JITTER_RATIO;
  return (t * 2 - 1) * max;
}

export function rotationForIndex(index: number, fullSpins = 0, jitterDeg = 0): number {
  const localCenter = (index + 0.5) * SEGMENT_ANGLE - 90 + jitterDeg;
  const mod = ((-localCenter + POINTER_ANGLE_DEG) % 360 + 360) % 360;
  return fullSpins * 360 + mod;
}

export function indexAtPointer(rotationDeg: number): number {
  const r = ((rotationDeg % 360) + 360) % 360;
  const localCenter = POINTER_ANGLE_DEG - r;
  const raw = (localCenter + 90 - SEGMENT_ANGLE / 2) / SEGMENT_ANGLE;
  return ((Math.round(raw) % ROULETTE_SEGMENTS) + ROULETTE_SEGMENTS) % ROULETTE_SEGMENTS;
}

export function wheelIndexForNumber(n: number): number {
  if (n >= 0 && n < ROULETTE_SEGMENTS) return n;
  return 0;
}

export function resolveWheelIndex(state: {
  result_index?: number | null;
  result_number?: number | null;
}): number | undefined {
  if (state.result_number != null) {
    return wheelIndexForNumber(state.result_number);
  }
  if (state.result_index != null) {
    return state.result_index;
  }
  return undefined;
}

export function alignRotationToIndex(
  currentRotation: number,
  index: number,
  jitterDeg = 0,
): number {
  const targetMod = rotationForIndex(index, 0, jitterDeg);
  const currentMod = ((currentRotation % 360) + 360) % 360;
  return currentRotation - currentMod + targetMod;
}

export function spinTargetRotation(
  currentRotation: number,
  index: number,
  minFullSpins = 8,
  jitterDeg = 0,
): number {
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const targetMod = rotationForIndex(index, 0, jitterDeg);
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  return currentMod + delta + minFullSpins * 360;
}

export function isLandingPause(state: RouletteRoundState): boolean {
  if (state.phase !== "spinning") return false;
  const endRaw = state.spin_ends_at || state.ends_at;
  if (!endRaw) return false;
  const endMs = new Date(endRaw).getTime();
  if (Number.isNaN(endMs)) return false;
  return Date.now() >= endMs;
}

export function easeSpinRoulette(t: number): number {
  return easeSpinWithSoftLanding(t);
}

export type RoulettePhase = "betting" | "spinning" | "result" | "waiting";

export type RouletteRoundState = {
  round_id: string;
  round_number: number;
  phase: RoulettePhase | string;
  ends_at: string;
  spin_ends_at?: string;
  server_seed_hash?: string;
  result_index?: number | null;
  result_number?: number | null;
  result?: string;
  server_seed?: string;
};

export function numberColor(n: number): RouletteColor {
  if (n >= 0 && n < WHEEL_COLORS.length) return WHEEL_COLORS[n];
  return "blue";
}

export function isRouletteColor(color: string): color is RouletteColor {
  return (ROULETTE_COLORS as readonly string[]).includes(color);
}

/** Map legacy round colors (classic / early x50) onto the current palette. */
export function normalizeRouletteColor(color: string): RouletteColor | null {
  switch (color) {
    case "blue":
    case "red":
    case "green":
    case "yellow":
      return color;
    case "gray":
      return "blue";
    case "gold":
      return "yellow";
    case "black":
      return "red";
    default:
      return null;
  }
}

export function colorLabel(color: string): string {
  switch (normalizeRouletteColor(color) ?? color) {
    case "blue":
      return "Синее";
    case "red":
      return "Красное";
    case "green":
      return "Зелёное";
    case "yellow":
      return "Жёлтое";
    default:
      return color;
  }
}

export function rouletteMultiplier(color: string): number {
  switch (color) {
    case "blue":
    case "red":
      return 2;
    case "green":
      return 5;
    case "yellow":
      return 50;
    default:
      return 0;
  }
}

export function payoutLabel(color: string): string {
  const m = rouletteMultiplier(color);
  return m > 0 ? `${m}x` : "";
}

export function roulettePlayerName(player: {
  first_name?: string;
  username?: string;
}): string {
  if (player.first_name?.trim()) return player.first_name.trim();
  if (player.username?.trim()) return `@${player.username.trim()}`;
  return "Игрок";
}

export const ROULETTE_WHEEL_COLORS = {
  blue: "#3390ec",
  red: "#e56555",
  green: "#3ecf8e",
  yellow: "#f0d060",
} as const;

export function rouletteFillStyle(
  color: string,
): { backgroundColor: string } | undefined {
  const normalized = normalizeRouletteColor(color);
  if (!normalized) return undefined;
  return { backgroundColor: ROULETTE_WHEEL_COLORS[normalized] };
}

export const ROULETTE_COLOR_STYLES = {
  blue: {
    bg: "bg-[#3390ec]",
    chip: "bg-[#3390ec]",
    tile: "bg-[#3390ec]/14 border border-[#3390ec]/30",
    dot: "bg-[#3390ec]",
    text: "text-[#6ab3f3]",
    label: "Синее",
    multiplier: "×2",
  },
  red: {
    bg: "bg-[#e56555]",
    chip: "bg-[#e56555]",
    tile: "bg-[#e56555]/14 border border-[#e56555]/30",
    dot: "bg-[#e56555]",
    text: "text-[#e57373]",
    label: "Красное",
    multiplier: "×2",
  },
  green: {
    bg: "bg-[#3ecf8e]",
    chip: "bg-[#3ecf8e]",
    tile: "bg-[#3ecf8e]/14 border border-[#3ecf8e]/30",
    dot: "bg-[#3ecf8e]",
    text: "text-[#5ee0a8]",
    label: "Зелёное",
    multiplier: "×5",
  },
  yellow: {
    bg: "bg-[#f0d060]",
    chip: "bg-[#f0d060]",
    tile: "bg-[#f0d060]/14 border border-[#f0d060]/35",
    dot: "bg-[#f0d060]",
    text: "text-[#f0d060]",
    label: "Жёлтое",
    multiplier: "×50",
  },
} as const;
