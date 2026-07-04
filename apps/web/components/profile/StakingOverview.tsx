"use client";

import { formatTON, StakingStats } from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { useLiveEarned } from "@/lib/staking-live";
import {
  formatStakingTierName,
  stakingBoostHint,
  stakingBoostThresholdTon,
} from "@/lib/staking-ui";
import { cn } from "@/lib/utils";
import { Sparkles, TrendingUp, Zap } from "lucide-react";

function ProgressBar({
  value,
  className,
  fillClassName,
}: {
  value: number;
  className?: string;
  fillClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-raised", className)}>
      <div
        className={cn("h-full rounded-full bg-accent transition-all duration-700 ease-out", fillClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type Props = {
  isBoost: boolean;
  stats: StakingStats;
};

export function StakingOverview({ isBoost, stats }: Props) {
  const liveEarned = useLiveEarned(stats.earned_nanoton, stats.active_daily_yield_nanoton);

  const portfolioPct = stats.total_count > 0 ? stats.staked_count / stats.total_count : 0;
  const unstakedCount = stats.total_count - stats.staked_count;

  const maxMonthly =
    stats.active_monthly_yield_nanoton + stats.unlockable_monthly_nanoton;
  const yieldPct =
    maxMonthly > 0 ? stats.active_monthly_yield_nanoton / maxMonthly : 0;

  const boostPct =
    stats.boost_threshold_nanoton > 0
      ? stats.boost_wager_nanoton / stats.boost_threshold_nanoton
      : 0;

  return (
    <div className="panel space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Общий доход</p>
          <p className="mt-1.5 text-[1.75rem] font-bold tabular-nums leading-none tracking-tight">
            <TonAmount
              amount={formatTON(liveEarned)}
              variant="brand"
              iconClassName="h-7 w-7"
            />
          </p>
        </div>
        <span className="chip chip-accent shrink-0">
          {formatStakingTierName(isBoost ? "boost" : "base")} · {stats.monthly_rate_percent}%
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="stat-tile">
          <p className="text-[10px] text-muted">В день</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-success">
            +{formatTON(stats.active_daily_yield_nanoton)}
          </p>
        </div>
        <div className="stat-tile">
          <p className="text-[10px] text-muted">В месяц</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            <TonAmount
              amount={formatTON(stats.active_monthly_yield_nanoton)}
              variant="brand"
              iconClassName="h-5 w-5"
            />
          </p>
        </div>
        <div className="stat-tile">
          <p className="text-[10px] text-muted">В стейке</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {stats.staked_count}
            <span className="text-muted">/{stats.total_count}</span>
          </p>
        </div>
      </div>

      {stats.total_count > 0 && (
        <div className="space-y-2 rounded-xl bg-surface-raised/70 py-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">Шкала дохода</span>
            {maxMonthly > 0 && (
              <span className="tabular-nums text-muted">
                {Math.round(yieldPct * 100)}% потенциала
              </span>
            )}
          </div>
          <ProgressBar
            value={yieldPct}
            fillClassName={yieldPct >= 1 ? "bg-success" : "bg-accent"}
          />
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 tabular-nums text-muted">
              сейчас
              <TonAmount
                amount={formatTON(stats.active_monthly_yield_nanoton)}
                variant="brand"
                iconClassName="h-5 w-5"
              />
              /мес
            </span>
            {stats.unlockable_monthly_nanoton > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums text-accent">
                <Zap className="h-3 w-3 shrink-0" />
                +{formatTON(stats.unlockable_monthly_nanoton)}
                <TonIcon variant="brand" className="h-5 w-5" />
              </span>
            )}
          </div>
        </div>
      )}

      {stats.total_count > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Портфель в стейке</span>
            <span className="tabular-nums text-muted">
              {stats.staked_count} из {stats.total_count}
            </span>
          </div>
          <ProgressBar value={portfolioPct} fillClassName="bg-success" />
          {unstakedCount > 0 ? (
            <p className="text-[11px] text-muted">
              Ещё {unstakedCount} {unstakedCount === 1 ? "подарок" : unstakedCount < 5 ? "подарка" : "подарков"} можно добавить
            </p>
          ) : stats.total_count > 0 ? (
            <p className="flex items-center gap-1 text-[11px] text-success">
              <TrendingUp className="h-3 w-3 shrink-0" />
              Весь портфель приносит доход
            </p>
          ) : null}
        </div>
      )}

      {!isBoost && stats.boost_threshold_nanoton > 0 && (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Повышенная ставка · 5%
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums text-muted">
              <TonAmount amount={formatTON(stats.boost_wager_nanoton)} variant="brand" iconClassName="h-5 w-5" />
              <span>/</span>
              <TonAmount amount={formatTON(stats.boost_threshold_nanoton)} variant="brand" iconClassName="h-5 w-5" />
            </span>
          </div>
          <ProgressBar value={boostPct} />
          <p className="inline-flex flex-wrap items-center gap-x-1 text-[11px] leading-relaxed text-muted">
            <TonAmount amount={String(stakingBoostThresholdTon())} variant="brand" iconClassName="h-5 w-5" />
            {stakingBoostHint()}
          </p>
        </div>
      )}

      {isBoost && (
        <p className="text-xs text-muted">
          Активна максимальная ставка — подарки приносят 5% в месяц.
        </p>
      )}
    </div>
  );
}
