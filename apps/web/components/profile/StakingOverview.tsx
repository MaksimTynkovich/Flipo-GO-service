"use client";

import { formatTON, StakingStats } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { useLiveEarned } from "@/lib/staking-live";
import {
  formatStakingEpochEnd,
  formatStakingTierName,
  pluralizeGifts,
  stakingBoostHint,
  stakingBoostThresholdTon,
  weeklyYieldFromMonthly,
  weeklyYieldNanoton,
} from "@/lib/staking-ui";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

function ProgressBar({
  value,
  fillClassName,
}: {
  value: number;
  fillClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn(
          "h-full rounded-full bg-accent transition-all duration-700 ease-out",
          fillClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type Props = {
  isBoost: boolean;
  stats: StakingStats;
  epochEndsAt?: string | null;
};

export function StakingOverview({ isBoost, stats, epochEndsAt }: Props) {
  const liveEarned = useLiveEarned(stats.earned_nanoton, stats.active_daily_yield_nanoton);

  const unstakedCount = Math.max(0, stats.total_count - stats.staked_count);
  const activeWeeklyYield = weeklyYieldNanoton(stats.active_daily_yield_nanoton);
  const unlockableWeeklyYield = weeklyYieldFromMonthly(stats.unlockable_monthly_nanoton);

  const boostPct =
    stats.boost_threshold_nanoton > 0
      ? stats.boost_wager_nanoton / stats.boost_threshold_nanoton
      : 0;

  const epoch = epochEndsAt ? formatStakingEpochEnd(epochEndsAt) : null;
  const hasPortfolio = stats.total_count > 0;
  const hasEarnings = liveEarned > 0 || stats.active_daily_yield_nanoton > 0;

  return (
    <section className="panel overflow-hidden p-0">
      <div className="space-y-4 px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted">
              {hasEarnings ? "Заработано" : "Ваш доход"}
            </p>
            <p className="mt-1.5 text-[1.75rem] font-bold tabular-nums leading-none tracking-tight text-foreground">
              <TonAmount
                amount={formatTON(liveEarned)}
                variant="brand"
                iconClassName="h-7 w-7"
              />
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {hasPortfolio
                ? "Начисляется каждый день сразу на баланс"
                : "Добавьте подарки — доход пойдёт автоматически"}
            </p>
          </div>
          <span className="chip chip-accent shrink-0">
            {formatStakingTierName(isBoost ? "boost" : "base")} · {stats.monthly_rate_percent}%/мес
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-surface-raised px-2.5 py-2.5">
            <p className="text-[10px] text-muted">В день</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-success">
              +{formatTON(stats.active_daily_yield_nanoton)}
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised px-2.5 py-2.5">
            <p className="text-[10px] text-muted">За неделю</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              <TonAmount
                amount={`+${formatTON(activeWeeklyYield)}`}
                variant="brand"
                iconClassName="h-4 w-4"
              />
            </p>
          </div>
          <div className="rounded-xl bg-surface-raised px-2.5 py-2.5">
            <p className="text-[10px] text-muted">В стейке</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {stats.staked_count}
              <span className="text-muted">/{stats.total_count}</span>
            </p>
          </div>
        </div>

        {hasPortfolio && unstakedCount > 0 && unlockableWeeklyYield > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">Потенциал</span>
              <span className="inline-flex items-center gap-1 tabular-nums text-accent">
                ещё +
                <TonAmount
                  amount={formatTON(unlockableWeeklyYield)}
                  variant="brand"
                  iconClassName="h-3.5 w-3.5"
                />
                /нед
              </span>
            </div>
            <ProgressBar
              value={activeWeeklyYield / (activeWeeklyYield + unlockableWeeklyYield)}
            />
            <p className="text-[11px] text-muted">
              Добавьте ещё {pluralizeGifts(unstakedCount)} — доход вырастет
            </p>
          </div>
        ) : null}

        {hasPortfolio && unstakedCount === 0 ? (
          <p className="text-xs font-medium text-success">Весь портфель приносит доход</p>
        ) : null}

        {!isBoost && stats.boost_threshold_nanoton > 0 ? (
          <div className="space-y-2 rounded-xl bg-accent/8 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Буст до 5%/мес
              </span>
              <span className="tabular-nums text-muted">
                {Math.min(100, Math.round(boostPct * 100))}%
              </span>
            </div>
            <ProgressBar value={boostPct} />
            <p className="inline-flex flex-wrap items-center gap-x-1 text-[11px] leading-relaxed text-muted">
              <TonAmount
                amount={String(stakingBoostThresholdTon())}
                variant="brand"
                iconClassName="h-3.5 w-3.5"
              />
              {stakingBoostHint()}
            </p>
          </div>
        ) : null}

        {isBoost ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Максимальная ставка 5%/мес активна
          </p>
        ) : null}
      </div>

      {epoch ? (
        <>
          <div className="hairline-top" />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs text-muted">Неделя до {epoch.dateLine}</p>
            <p className="shrink-0 text-xs tabular-nums text-muted">{epoch.timeLine}</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
