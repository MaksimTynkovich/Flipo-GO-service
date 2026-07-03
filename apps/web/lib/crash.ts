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

export const CRASH_GROWTH_PER_MS = Number(
  process.env.NEXT_PUBLIC_CRASH_GROWTH_PER_MS ?? 0.00006,
);

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
  if (value < 3) return `${value.toFixed(3)}×`;
  return `${value.toFixed(2)}×`;
}

export function formatMultiplierCompact(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "1.00";
  return value.toFixed(2);
}

export function multiplierAtElapsedMsPrecise(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return Math.exp(CRASH_GROWTH_PER_MS * elapsedMs);
}

export function multiplierAtElapsedMs(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return Math.floor(multiplierAtElapsedMsPrecise(elapsedMs) * 100) / 100;
}

export function liveMultiplier(elapsedMs: number, serverCap?: number): number {
  const precise = multiplierAtElapsedMsPrecise(elapsedMs);
  if (serverCap == null) return precise;
  return Math.min(precise, serverCap + 0.0005);
}

export function elapsedMsForRunning(state: CrashRoundState | null): number {
  if (!state?.running_since) return 0;
  const start = new Date(state.running_since).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Date.now() - start);
}

export function historyBadgeClass(mult: number): string {
  if (mult >= 8) {
    return "border-transparent bg-accent text-[#1a1f26] shadow-[0_0_14px_rgba(241,196,15,0.28)]";
  }
  if (mult < 1.35) {
    return "border-white/15 bg-white/[0.03] text-danger";
  }
  return "border-white/20 bg-white/[0.05] text-foreground";
}

export type ChartViewport = { yMax: number; xMaxMs: number };

/** Стартовый viewport — используется только до первого кадра running */
export function initialChartViewport(): ChartViewport {
  return chartViewportFor(1, 0);
}

export function elapsedMsForMultiplier(mult: number): number {
  if (mult <= 1 || CRASH_GROWTH_PER_MS <= 0) return 0;
  return Math.log(mult) / CRASH_GROWTH_PER_MS;
}

/** Время для оси X — совпадает с capped-множителем, если сервер отстаёт от клиента */
export function chartElapsedMs(elapsedMs: number, mult: number): number {
  if (mult <= 1.001) return 0;
  const predicted = multiplierAtElapsedMsPrecise(elapsedMs);
  if (mult >= predicted * 0.999) return elapsedMs;
  return elapsedMsForMultiplier(mult);
}

export function timeToX(elapsedMs: number, xMaxMs: number, width: number, padding: number): number {
  const innerW = width - padding * 2;
  const norm = Math.min(1, Math.max(0, elapsedMs / Math.max(xMaxMs, 1)));
  const x = padding + norm * innerW;
  return Math.max(padding, Math.min(width - padding, x));
}

/**
 * Viewport пропорционален текущему множителю и времени.
 * Кончик всегда в одной зоне экрана, без скачков при zoom-out.
 * Форма кривой (плоско → резко вверх) даёт ощущение ускорения.
 */
export function chartViewportFor(mult: number, chartMs: number): ChartViewport {
  const safeMult = Math.max(1, mult);
  return {
    yMax: Math.max(1.55, safeMult * 1.1),
    xMaxMs: Math.max(5000, chartMs > 0 ? chartMs / 0.94 : 5000),
  };
}

/** Y: pow < 1 — дольше полого в начале, резче в конце (как в crash) */
export function multToY(mult: number, yMax: number, height: number, padding: number): number {
  const linearNorm = Math.max(0, Math.min(1, (mult - 1) / Math.max(yMax - 1, 0.01)));
  const norm = Math.pow(linearNorm, 0.82);
  const innerH = height - padding * 2;
  const y = height - padding - norm * innerH;
  return Math.max(padding, Math.min(height - padding, y));
}

/** Подгоняет viewport под финальный crash_point */
export function fitChartViewport(mult: number, chartMs: number): ChartViewport {
  return chartViewportFor(mult, chartMs);
}

export function multToX(mult: number, xMax: number, width: number, padding: number): number {
  const innerW = width - padding * 2;
  const logMax = Math.log(Math.max(xMax, 1.01));
  const norm = Math.log(Math.max(1, mult)) / logMax;
  return padding + Math.min(1, norm) * innerW;
}
