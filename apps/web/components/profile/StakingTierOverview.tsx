"use client";

import { formatTON, StakingStats } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatStakingTierName, formatStakingTierSummary, stakingBoostHint, stakingBoostThresholdTon } from "@/lib/staking-ui";
import { cn } from "@/lib/utils";

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
  isBoost: boolean;
  stats: Pick<StakingStats, "boost_wager_nanoton" | "boost_threshold_nanoton" | "monthly_rate_percent">;
};

export function StakingTierOverview({ isBoost, stats }: Props) {
  const boostPct =
    stats.boost_threshold_nanoton > 0
      ? stats.boost_wager_nanoton / stats.boost_threshold_nanoton
      : 0;

  return (
    <div className="panel space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Доходность</p>
          <p className="mt-1 text-[15px] font-semibold">
            {isBoost ? formatStakingTierSummary("boost") : formatStakingTierSummary("base")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {isBoost
              ? "Подарки в стейке приносят 5% в месяц от их стоимости."
              : "Подарки в стейке приносят 3% в месяц. Можно повысить до 5%."}
          </p>
        </div>
        <span className="chip chip-accent shrink-0 text-[10px]">{stats.monthly_rate_percent}%/мес</span>
      </div>

      {isBoost ? (
        <p className="text-xs text-muted">
          У тебя <span className="font-medium text-foreground">{formatStakingTierName("boost")}</span> уровень —
          ставка уже максимальная.
        </p>
      ) : stats.boost_threshold_nanoton > 0 ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Повышенная ставка · 5%/мес</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-muted">
              <TonAmount amount={formatTON(stats.boost_wager_nanoton)} />
              <span>/</span>
              <TonAmount amount={formatTON(stats.boost_threshold_nanoton)} />
            </span>
          </div>
          <ProgressBar value={boostPct} />
          <p className="inline-flex flex-wrap items-center gap-x-1 text-[11px] text-muted">
            <TonAmount amount={String(stakingBoostThresholdTon())} />
            {stakingBoostHint()}
          </p>
        </div>
      ) : null}
    </div>
  );
}
