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

export function multiplierAtElapsedMsFloored(elapsedMs: number): number {
  const raw = multiplierAtElapsedMs(elapsedMs);
  return Math.floor(raw * 100) / 100;
}

export function liveMultiplier(elapsedMs: number): number {
  return multiplierAtElapsedMs(elapsedMs);
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

export type CrashHistoryTier = {
  chip: string;
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
      chip: "bg-success/18",
      value: "text-success",
      label: "Мун",
    };
  }
  if (mult >= 5) {
    return {
      chip: "chip-accent",
      value: "text-accent",
      label: "Высокий",
    };
  }
  if (mult >= 2) {
    return {
      chip: "bg-surface",
      value: "text-foreground",
      label: "Средний",
    };
  }
  if (mult < 1.35) {
    return {
      chip: "bg-danger/16",
      value: "text-danger",
      label: "Краш",
    };
  }
  return {
    chip: "bg-surface-raised",
    value: "text-muted",
    label: "Низкий",
  };
}
