"use client";

import { formatTON, StakingStats } from "@/lib/api";
import { useLiveEarned } from "@/lib/staking-live";
import { cn } from "@/lib/utils";
import { TrendingUp, Zap } from "lucide-react";

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-raised", className)}>
      <div
        className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type Props = {
  stats: StakingStats;
  isBoost: boolean;
};

export function StakingDashboard({ stats, isBoost }: Props) {
  const liveEarned = useLiveEarned(stats.earned_nanoton, stats.active_daily_yield_nanoton);

  const portfolioPct = stats.total_count > 0 ? stats.staked_count / stats.total_count : 0;
  const boostPct =
    stats.boost_threshold_nanoton > 0
      ? stats.boost_wager_nanoton / stats.boost_threshold_nanoton
      : 0;
  const unstakedCount = stats.total_count - stats.staked_count;

  return (
    <div className="space-y-3">
      <div className="panel space-y-3">
        <p className="section-label">Заработано</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {formatTON(liveEarned)}
            <span className="ml-1.5 text-sm font-medium text-muted">TON</span>
          </p>
          {stats.active_daily_yield_nanoton > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-success/10 px-2 py-1 text-success">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold tabular-nums">
                +{formatTON(stats.active_daily_yield_nanoton)}/д
              </span>
            </div>
          )}
        </div>
        {stats.active_monthly_yield_nanoton > 0 && (
          <p className="mt-1 text-xs text-muted">
            ~{formatTON(stats.active_monthly_yield_nanoton)} TON в месяц при текущем портфеле
          </p>
        )}
      </div>

      <div className="panel-sm space-y-2">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Портфель в стейке</span>
          <span className="tabular-nums text-muted">
            {stats.staked_count}/{stats.total_count}
          </span>
        </div>
        <ProgressBar value={portfolioPct} />
        {unstakedCount > 0 && stats.unlockable_monthly_nanoton > 0 && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-accent">
            <Zap className="h-3 w-3 shrink-0" />
            +{formatTON(stats.unlockable_monthly_nanoton)} TON/мес — застейкай ещё {unstakedCount}
          </p>
        )}
        {stats.staked_count === stats.total_count && stats.total_count > 0 && (
          <p className="mt-2 text-[11px] text-success">Весь портфель работает на тебя</p>
        )}
      </div>

      {!isBoost && stats.boost_threshold_nanoton > 0 && (
        <div className="panel-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Буст до 5%</span>
            <span className="tabular-nums text-muted">
              {formatTON(stats.boost_wager_nanoton)} / {formatTON(stats.boost_threshold_nanoton)} TON
            </span>
          </div>
          <ProgressBar value={boostPct} />
          <p className="mt-2 text-[11px] text-muted">5 TON в рулетке за 7 дней → ставка 5%/мес</p>
        </div>
      )}
    </div>
  );
}
