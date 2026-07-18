/** 15-секторная рулетка (0–14) — порядок как на референсе */

import { easeSpinWithSoftLanding } from "@/lib/spin-ease";

export const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14] as const;

export const ROULETTE_SEGMENTS = WHEEL_ORDER.length;
export const SEGMENT_ANGLE = 360 / ROULETTE_SEGMENTS;
export const SPIN_DURATION_MS = 12_000;
/** Пауза после остановки колеса до объявления результата (0 = сразу) */
export const RESULT_PAUSE_MS = 0;
/** Must match backend ROULETTE_RESULT_DISPLAY_SECONDS — used for HTTP resync */
export const RESULT_DISPLAY_MS = 3_000;
/** Доля половины сектора — случайное смещение остановки внутри ячейки */
export const SEGMENT_JITTER_RATIO = 0.38;

/** Указатель сверху (12 часов) */
export const POINTER_ANGLE_DEG = -90;

/**
 * Детерминированное смещение внутри сектора (не в центр числа).
 * Зависит от round_id — одинаково при перезагрузке.
 */
export function jitterForRound(roundId: string): number {
  let hash = 0;
  for (let i = 0; i < roundId.length; i++) {
    hash = (hash * 31 + roundId.charCodeAt(i)) | 0;
  }
  const t = (Math.abs(hash) % 1000) / 1000;
  const max = SEGMENT_ANGLE * SEGMENT_JITTER_RATIO;
  return (t * 2 - 1) * max;
}

/**
 * Угол CSS-поворота, при котором центр сектора index окажется под указателем.
 * В SVG/CSS положительный rotate сдвигает точку: мировой_угол = локальный + R
 */
export function rotationForIndex(index: number, fullSpins = 0, jitterDeg = 0): number {
  const localCenter = (index + 0.5) * SEGMENT_ANGLE - 90 + jitterDeg;
  const mod = ((-localCenter + POINTER_ANGLE_DEG) % 360 + 360) % 360;
  return fullSpins * 360 + mod;
}

/** Какой индекс сектора сейчас под указателем при данном rotation */
export function indexAtPointer(rotationDeg: number): number {
  const r = ((rotationDeg % 360) + 360) % 360;
  const localCenter = POINTER_ANGLE_DEG - r;
  const raw = (localCenter + 90 - SEGMENT_ANGLE / 2) / SEGMENT_ANGLE;
  return ((Math.round(raw) % ROULETTE_SEGMENTS) + ROULETTE_SEGMENTS) % ROULETTE_SEGMENTS;
}

export function wheelIndexForNumber(n: number): number {
  const idx = WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
  return idx >= 0 ? idx : 0;
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

/** Колесо остановилось, но результат ещё не объявлен */
export function isLandingPause(state: RouletteRoundState): boolean {
  if (state.phase !== "spinning") return false;
  const endRaw = state.spin_ends_at || state.ends_at;
  if (!endRaw) return false;
  const endMs = new Date(endRaw).getTime();
  if (Number.isNaN(endMs)) return false;
  return Date.now() >= endMs;
}

/**
 * Имитация трения: сильный старт, затем мягкая посадка с нулевой скоростью в конце.
 */
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

export function numberColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  if (n >= 1 && n <= 7) return "red";
  return "black";
}

export function colorLabel(color: string): string {
  switch (color) {
    case "green":
      return "Зелёное";
    case "red":
      return "Красное";
    case "black":
      return "Чёрное";
    default:
      return color;
  }
}

export function payoutLabel(color: string): string {
  switch (color) {
    case "green":
      return "14x";
    case "red":
    case "black":
      return "2x";
    default:
      return "";
  }
}

export function roulettePlayerName(player: {
  first_name?: string;
  username?: string;
}): string {
  if (player.first_name?.trim()) return player.first_name.trim();
  if (player.username?.trim()) return `@${player.username.trim()}`;
  return "Игрок";
}

/** Классические цвета рулетки — насыщенные, но без неонового перебора */
export const ROULETTE_WHEEL_COLORS = {
  red: "#c62828",
  green: "#2e9b52",
  black: "#181818",
} as const;

export function rouletteFillStyle(
  color: string,
): { backgroundColor: string } | undefined {
  const key = color as keyof typeof ROULETTE_WHEEL_COLORS;
  if (key in ROULETTE_WHEEL_COLORS) {
    return { backgroundColor: ROULETTE_WHEEL_COLORS[key] };
  }
  return undefined;
}

export const ROULETTE_COLOR_STYLES = {
  red: {
    bg: "bg-[#c62828]",
    chip: "bg-[#c62828]",
    tile: "bg-[#c62828]/14 border border-[#c62828]/30",
    dot: "bg-[#c62828]",
    text: "text-[#e57373]",
    label: "Красное",
    multiplier: "×2",
  },
  green: {
    bg: "bg-[#2e9b52]",
    chip: "bg-[#2e9b52]",
    tile: "bg-[#2e9b52]/14 border border-[#2e9b52]/30",
    dot: "bg-[#2e9b52]",
    text: "text-[#81c784]",
    label: "Зелёное",
    multiplier: "×14",
  },
  black: {
    bg: "bg-[#181818]",
    chip: "bg-[#181818] ring-1 ring-inset ring-white/[0.1]",
    tile: "bg-[#181818]/50 border border-white/[0.1]",
    dot: "bg-[#181818] ring-1 ring-inset ring-white/[0.12]",
    text: "text-foreground",
    label: "Чёрное",
    multiplier: "×2",
  },
} as const;
