"use client";

import { Button } from "@/components/ui/button";
import { formatTON } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { pluralizeGifts } from "@/lib/staking-ui";

type Props = {
  label: string;
  disabled: boolean;
  giftCount: number;
  totalPriceNanoton: number;
  weeklyYieldNanoton: number;
  onStake: () => void;
};

export function StakingActionBar({
  label,
  disabled,
  giftCount,
  totalPriceNanoton,
  weeklyYieldNanoton,
  onStake,
}: Props) {
  const showMetrics = giftCount > 0;

  return (
    <div className="panel overflow-hidden p-0">
      {showMetrics ? (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <p className="min-w-0 truncate text-[11px] tabular-nums text-muted">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <TonAmount
                amount={formatTON(totalPriceNanoton)}
                variant="brand"
                iconClassName="h-3.5 w-3.5"
              />
            </span>
            <span className="mx-1.5 opacity-40">·</span>
            <span className="inline-flex items-center gap-1 text-success">
              +
              <TonAmount
                amount={formatTON(weeklyYieldNanoton)}
                variant="brand"
                iconClassName="h-3.5 w-3.5"
              />
              /нед
            </span>
          </p>
          <p className="shrink-0 text-[11px] text-muted">{pluralizeGifts(giftCount)}</p>
        </div>
      ) : null}

      <div className={showMetrics ? "px-2 pb-2" : "p-2"}>
        <Button
          variant="accent"
          className="h-11 w-full rounded-xl text-sm font-bold"
          disabled={disabled}
          analyticsAction="staking_submit"
          onClick={onStake}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
