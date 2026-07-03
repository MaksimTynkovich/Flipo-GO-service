export type CrashPhase = "betting" | "running" | "crashed" | "waiting";

export type CrashRoundState = {
  round_id: string;
  round_number: number;
  phase: CrashPhase | string;
  multiplier: number;
  crash_point?: number;
  ends_at?: string;
  server_seed_hash?: string;
};

export const PHASE_LABEL: Record<string, string> = {
  betting: "Приём ставок",
  running: "Полёт",
  crashed: "Краш",
  waiting: "Ожидание",
};

export function phaseLabel(phase: string | undefined): string {
  if (!phase) return "—";
  return PHASE_LABEL[phase] ?? phase;
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "1.00×";
  return `${value.toFixed(2)}×`;
}

/** Цвет чипа в истории по множителю */
export function multiplierTier(mult: number): "low" | "mid" | "high" | "moon" {
  if (mult < 1.5) return "low";
  if (mult < 3) return "mid";
  if (mult < 10) return "high";
  return "moon";
}

export const TIER_COLORS = {
  low: "bg-danger/90",
  mid: "bg-[#e67e22]",
  high: "bg-success",
  moon: "bg-accent text-[#1a1f26]",
} as const;

export function chartYMax(multiplier: number, crashPoint?: number): number {
  const peak = Math.max(multiplier, crashPoint ?? 1);
  return Math.max(2.2, Math.ceil(peak * 1.25 * 10) / 10);
}

export function multToY(mult: number, yMax: number, height: number, padding: number): number {
  const range = yMax - 1;
  const norm = (mult - 1) / range;
  return height - padding - norm * (height - padding * 2);
}
