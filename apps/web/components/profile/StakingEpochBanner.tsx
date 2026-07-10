"use client";

import { formatStakingEpochEnd } from "@/lib/staking-ui";
import { CalendarClock } from "lucide-react";

type Props = {
  endsAt: string;
};

export function StakingEpochBanner({ endsAt }: Props) {
  const { dateLine, timeLine } = formatStakingEpochEnd(endsAt);

  return (
    <div className="panel-sm flex items-center gap-3">
      <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
        <CalendarClock className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">До {dateLine}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted">
          {timeLine} · доход каждый день на баланс
        </p>
      </div>
    </div>
  );
}
