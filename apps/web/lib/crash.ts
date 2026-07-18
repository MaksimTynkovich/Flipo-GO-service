export type CrashPhase = "betting" | "running" | "crashed" | "waiting";

export type CrashRoundState = {
  round_id: string;
  round_number: number;
  phase: CrashPhase | string;
  multiplier: number;
  crash_point?: number;
  ends_at?: string;
  running_since?: string;
  server_seed_hash?: string;
};

/** Must match backend CRASH_TICK_MS */
export const CRASH_TICK_MS = Number(process.env.NEXT_PUBLIC_CRASH_TICK_MS ?? 100);

/** Must match backend CRASH_GROWTH_PER_MS */
export const CRASH_GROWTH_PER_MS = Number(
  process.env.NEXT_PUBLIC_CRASH_GROWTH_PER_MS ?? 0.00006,
);

/** Диагональ графика: log-шкала до этого множителя (X и Y синхронно) */
export const CRASH_CHART_LOG_MAX = 100;

export const PHASE_LABEL: Record<string, string> = {
  betting: "Приём ставок",
  running: "В раунде",
  crashed: "Краш",
  waiting: "Ожидание",
};

export function phaseLabel(phase: string | undefined): string {
  if (!phase) return "—";
  return PHASE_LABEL[phase] ?? phase;
}

export function statusSubtext(phase: string | undefined): string {
  if (phase === "betting") return "До старта";
  if (phase === "running") return "В раунде";
  if (phase === "crashed") return "Упал";
  return "Ожидание";
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "1.00×";
  return `${value.toFixed(2)}×`;
}

export function formatMultiplierLive(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "1.00×";
  if (value < 100) return `${value.toFixed(2)}×`;
  return `${value.toFixed(1)}×`;
}

export function formatMultiplierCompact(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "1.00";
  return value.toFixed(2);
}

export function multiplierAtElapsedMs(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return Math.exp(CRASH_GROWTH_PER_MS * elapsedMs);
}

/** Same floor as backend crash engine (math.Floor(raw*100)/100). */
export function floorMultiplier(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw * 100) / 100;
}

export function multiplierAtElapsedMsFloored(elapsedMs: number): number {
  return floorMultiplier(multiplierAtElapsedMs(elapsedMs));
}

/** Align client clock to a server multiplier sample. */
export function calibrateClockOffsetMs(
  runStartMs: number,
  serverMultiplier: number,
  atClientMs: number = Date.now(),
): number {
  return atClientMs - runStartMs - elapsedMsForMultiplier(Math.max(1, serverMultiplier));
}

/**
 * Continuous local growth from run start + clock skew.
 * Do not blend toward floored WS samples — that creates sawtooth jumps
 * whenever the server stays on the same 0.01× bin for >1 tick.
 */
export function computeRunningMultiplier(params: {
  runStartMs: number;
  clockOffsetMs: number;
  nowMs?: number;
}): number {
  const now = params.nowMs ?? Date.now();
  const elapsed = Math.max(0, now - params.clockOffsetMs - params.runStartMs);
  return Math.max(1, multiplierAtElapsedMs(elapsed));
}

export function liveMultiplier(elapsedMs: number): number {
  return multiplierAtElapsedMsFloored(elapsedMs);
}

export function resolveRunStartMs(state: CrashRoundState): number {
  if (state.running_since) {
    const t = new Date(state.running_since).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

export function elapsedMsForMultiplier(mult: number): number {
  if (mult <= 1 || CRASH_GROWTH_PER_MS <= 0) return 0;
  return Math.log(mult) / CRASH_GROWTH_PER_MS;
}

export function chartProgress(mult: number): number {
  if (mult <= 1) return 0;
  return Math.min(1, Math.log(mult) / Math.log(CRASH_CHART_LOG_MAX));
}

/** Log-curve used by the rocket stage (~1–20× fills the first screen). */
export const CRASH_FLIGHT_VISUAL_MAX = 20;

/**
 * Uncapped flight progress. Same early curve as the stage fill, but continues
 * past 1 so the camera can keep climbing on high multipliers.
 */
export function flightProgressWorld(mult: number): number {
  if (mult <= 1) return 0;
  const raw = Math.log(mult) / Math.log(CRASH_FLIGHT_VISUAL_MAX);
  return Math.pow(Math.max(0, raw), 0.78);
}

/**
 * Visual flight progress for the rocket stage (0–1).
 * Spreads early multipliers (1–3×) across more of the screen so the trail is readable.
 */
export function flightProgress(mult: number): number {
  return Math.min(1, flightProgressWorld(mult));
}

export type CrashHistoryTier = {
  value: string;
  label: string;
};

export function crashPlayerName(player: {
  first_name?: string;
  username?: string;
}): string {
  if (player.first_name?.trim()) return player.first_name.trim();
  if (player.username?.trim()) return `@${player.username.trim()}`;
  return "Игрок";
}

export function historyTierStyle(mult: number): CrashHistoryTier {
  if (mult >= 10) {
    return {
      value: "text-success",
      label: "Мун",
    };
  }
  if (mult >= 5) {
    return {
      value: "text-accent",
      label: "Высокий",
    };
  }
  if (mult >= 2) {
    return {
      value: "text-foreground",
      label: "Средний",
    };
  }
  if (mult < 1.35) {
    return {
      value: "text-danger",
      label: "Краш",
    };
  }
  return {
    value: "text-muted",
    label: "Низкий",
  };
}

/** Curve / multiplier heat as mult climbs. */
export function crashHeatTone(mult: number): "calm" | "warm" | "hot" | "blaze" {
  if (mult >= 10) return "blaze";
  if (mult >= 5) return "hot";
  if (mult >= 2) return "warm";
  return "calm";
}

export const CRASH_AUTO_PRESETS = ["1.5", "2", "3", "5", "10"] as const;
