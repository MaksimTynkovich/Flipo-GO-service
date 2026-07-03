/** 15-секторная рулетка (0–14) — порядок как на референсе */

export const WHEEL_ORDER = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14] as const;

export const ROULETTE_SEGMENTS = WHEEL_ORDER.length;
export const SEGMENT_ANGLE = 360 / ROULETTE_SEGMENTS;
export const SPIN_DURATION_MS = 12_000;
/** Пауза после остановки колеса до объявления результата (синхрон с бэкендом) */
export const RESULT_PAUSE_MS = 1_000;
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
 * Плавное замедление: скорость стремится к 0 в конце (ease-out, степень 7).
 * В отличие от экспоненты, нет резкого обрыва на последнем кадре.
 */
export function easeSpinFriction(t: number): number {
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  const u = 1 - t;
  return 1 - u * u * u * u * u * u * u;
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
