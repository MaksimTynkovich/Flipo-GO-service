/** Hold header balance updates for wheel prizes until the reel lands. */

export type WheelPrizeBalancePatch = {
  betting_balance: number;
  promo_balance?: number;
  delta_nanoton?: number;
};

let holding = false;
let pending: WheelPrizeBalancePatch | null = null;

export function isWheelPrizeBalanceHeld(): boolean {
  return holding;
}

export function setWheelPrizeBalanceHold(active: boolean): void {
  holding = active;
  if (!active) {
    // Caller is responsible for takePendingWheelPrizeBalance() before/after release.
  }
}

export function stashWheelPrizeBalance(patch: WheelPrizeBalancePatch): void {
  pending = patch;
}

export function takePendingWheelPrizeBalance(): WheelPrizeBalancePatch | null {
  const next = pending;
  pending = null;
  return next;
}
