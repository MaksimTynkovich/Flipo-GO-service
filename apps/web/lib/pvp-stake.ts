export const PVP_STAKE_TOLERANCE_BPS = 1000;

export function pvpStakeBounds(referenceNanoton: number) {
  if (referenceNanoton <= 0) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.floor((referenceNanoton * (10000 - PVP_STAKE_TOLERANCE_BPS)) / 10000),
    max: Math.floor((referenceNanoton * (10000 + PVP_STAKE_TOLERANCE_BPS)) / 10000),
  };
}

export function pvpGiftWithinTolerance(referenceNanoton: number, giftNanoton: number) {
  if (referenceNanoton <= 0 || giftNanoton <= 0) return false;
  const { min, max } = pvpStakeBounds(referenceNanoton);
  return giftNanoton >= min && giftNanoton <= max;
}

export function formatWinChanceBps(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

export function estimateJoinWinChanceBps(roomStakeNanoton: number, joinStakeNanoton: number) {
  const total = roomStakeNanoton + joinStakeNanoton;
  if (total <= 0) return 5000;
  return Math.round((joinStakeNanoton * 10000) / total);
}
