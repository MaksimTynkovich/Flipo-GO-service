export const NANOTON_PER_TON = 1_000_000_000;

export function nanotonToTonInput(nanoton: number, decimals = 3): string {
  return (nanoton / NANOTON_PER_TON).toFixed(decimals);
}

export function tonInputToNanoton(ton: string): number {
  const parsed = Number.parseFloat(ton.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * NANOTON_PER_TON);
}

export function bpsToPercentInput(bps: number, decimals = 2): string {
  return (bps / 100).toFixed(decimals);
}

export function percentInputToBps(percent: string): number {
  const parsed = Number.parseFloat(percent.replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}
