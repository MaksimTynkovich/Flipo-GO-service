/** Hold header balance updates for case TON prizes until the reveal finishes. */

export type CasePrizeBalancePatch = {
  betting_balance: number;
  delta_nanoton?: number;
};

let holding = false;
let pending: CasePrizeBalancePatch | null = null;

export function isCasePrizeBalanceHeld(): boolean {
  return holding;
}

export function setCasePrizeBalanceHold(active: boolean): void {
  holding = active;
}

export function stashCasePrizeBalance(patch: CasePrizeBalancePatch): void {
  pending = patch;
}

export function takePendingCasePrizeBalance(): CasePrizeBalancePatch | null {
  const next = pending;
  pending = null;
  return next;
}
