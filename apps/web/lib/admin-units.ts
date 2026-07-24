export const NANOTON_PER_TON = 1_000_000_000;

/** Basis for chance→weight so 1% = 100 parts (0.01% resolution). */
const CHANCE_WEIGHT_BASIS = 10_000;

export function nanotonToTonInput(nanoton: number, decimals = 3): string {
  const ton = nanoton / NANOTON_PER_TON;
  if (!Number.isFinite(ton)) return "0";
  // Trim trailing zeros but keep at least one fractional digit only when needed.
  const fixed = ton.toFixed(decimals);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "") || "0";
}

export function tonInputToNanoton(ton: string): number {
  const raw = ton.trim().replace(",", ".");
  if (raw === "" || raw === "." || raw === "-" || raw === "-.") return 0;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * NANOTON_PER_TON);
}

export function bpsToPercentInput(bps: number, decimals = 2): string {
  const pct = bps / 100;
  if (!Number.isFinite(pct)) return "0";
  const fixed = pct.toFixed(decimals);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "") || "0";
}

export function percentInputToBps(percent: string): number {
  const raw = percent.trim().replace(",", ".");
  if (raw === "" || raw === "." || raw === "-" || raw === "-.") return 0;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Set one row's chance to targetPct; rescale other rows proportionally onto a
 * 10000-part basis so fine percentages (1%, 0.5%) work with integer weights.
 */
export function applyChancePercentWeights(
  targetPct: number,
  currentKey: string,
  entries: { key: string; weight: number }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  if (entries.length === 0) return result;

  if (entries.length === 1) {
    result[entries[0].key] = CHANCE_WEIGHT_BASIS;
    return result;
  }

  const others = entries.filter((e) => e.key !== currentKey);
  const otherSum = others.reduce((s, e) => s + Math.max(0, e.weight), 0);

  let p = targetPct;
  if (!Number.isFinite(p) || p <= 0) p = 0.01;
  // Leave at least 0.01% for others combined.
  if (p >= 100) p = 99.99;

  const thisW = Math.max(1, Math.round((p / 100) * CHANCE_WEIGHT_BASIS));
  const otherTarget = Math.max(others.length, CHANCE_WEIGHT_BASIS - thisW);

  result[currentKey] = thisW;

  if (otherSum <= 0) {
    const each = Math.max(1, Math.floor(otherTarget / others.length));
    let assigned = 0;
    others.forEach((e, i) => {
      if (i === others.length - 1) {
        result[e.key] = Math.max(1, otherTarget - assigned);
      } else {
        result[e.key] = each;
        assigned += each;
      }
    });
    return result;
  }

  let assigned = 0;
  others.forEach((e, i) => {
    if (i === others.length - 1) {
      result[e.key] = Math.max(1, otherTarget - assigned);
    } else {
      const w = Math.max(1, Math.round((Math.max(0, e.weight) / otherSum) * otherTarget));
      result[e.key] = w;
      assigned += w;
    }
  });
  return result;
}

/** @deprecated use applyChancePercentWeights — kept for simple single-row estimate */
export function weightFromChancePercent(
  targetPct: number,
  currentWeight: number,
  weightTotal: number,
): number {
  const other = Math.max(0, weightTotal - Math.max(0, currentWeight));
  if (other <= 0) return Math.max(1, currentWeight || 1);
  if (!Number.isFinite(targetPct) || targetPct <= 0) return 1;
  if (targetPct >= 100) {
    return Math.max(1, Math.round(other * 9999));
  }
  const w = Math.round((other * targetPct) / (100 - targetPct));
  return Math.max(1, w);
}

export function chancePercentFromWeight(weight: number, weightTotal: number): number {
  if (weightTotal <= 0 || weight <= 0) return 0;
  return (weight / weightTotal) * 100;
}
