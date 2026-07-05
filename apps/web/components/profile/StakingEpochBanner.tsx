"use client";

import { formatStakingEpochEnd } from "@/lib/staking-ui";
import { CalendarClock, Wallet } from "lucide-react";

type Props = {
  endsAt: string;
};

export function StakingEpochBanner({ endsAt }: Props) {
  const { dateLine, timeLine } = formatStakingEpochEnd(endsAt);

  return (
    <div className="panel-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
          <CalendarClock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Текущая неделя</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
            До {dateLine}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted">{timeLine}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-surface-raised px-3 py-2.5">
        <Wallet className="h-3.5 w-3.5 shrink-0 text-accent" />
        <p className="text-xs leading-snug text-muted">
          Доход начисляется каждый день, выплата на баланс — в конце недели
        </p>
      </div>
    </div>
  );
}
