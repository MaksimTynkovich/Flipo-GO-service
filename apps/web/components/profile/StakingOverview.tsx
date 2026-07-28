"use client";

import { formatTON, StakingStats } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { useLiveEarned } from "@/lib/staking-live";
import {
  formatStakingApr,
  formatStakingEpochEnd,
  formatStakingRate,
  pluralizeGifts,
  dailyYieldFromMonthly,
  stakingBoostHint,
  stakingStreakHint,
  STAKING_STREAK_TARGET_DAYS,
} from "@/lib/staking-ui";
import { cn } from "@/lib/utils";
import { Flame, Sparkles } from "lucide-react";

function ProgressBar({
  value,
  tone = "accent",
}: {
  value: number;
  tone?: "accent" | "danger" | "success";
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          tone === "accent" && "bg-accent",
          tone === "danger" && "bg-danger",
          tone === "success" && "bg-success",
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
  const unlockableDailyYield = dailyYieldFromMonthly(stats.unlockable_monthly_nanoton);

  const boostPct =
    stats.boost_referral_target > 0
      ? stats.boost_referral_count / stats.boost_referral_target
      : 0;

  const epoch = epochEndsAt ? formatStakingEpochEnd(epochEndsAt) : null;
  const hasPortfolio = stats.total_count > 0;
  const aprLabel = formatStakingApr(stats.monthly_rate_percent);
  const poolFull = (stats.tvl_remaining_nanoton ?? 1) <= 0;
  const tvlCap = stats.tvl_cap_nanoton ?? 0;
  const tvlUsed = stats.tvl_nanoton ?? 0;
  const personalLimit = stats.personal_limit_nanoton ?? 0;
  const personalUsed = stats.personal_used_nanoton ?? 0;
  const streakTarget = stats.streak_target ?? STAKING_STREAK_TARGET_DAYS;
  const streakCurrent = stats.streak_current ?? 0;
  const streakBonusActive = stats.streak_bonus_active ?? false;
  const streakBonusDaysRemaining = stats.streak_bonus_days_remaining ?? 0;
  const streakProgress =
    streakTarget > 0 ? Math.min(1, streakCurrent / streakTarget) : 0;

  return (
    <div className="space-y-3">
      <section className="panel overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted">Заработано</p>
            <p className="mt-1.5 text-[1.75rem] font-bold tabular-nums leading-none tracking-tight">
              <TonAmount
                amount={formatTON(liveEarned)}
                variant="brand"
                iconClassName="h-7 w-7"
              />
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {hasPortfolio
                ? "Ежедневный доход: выплата сегодня ночью · завтра снова застейкайте"
                : "Стейкинг каждый день: застейкайте подарки — доход придёт ночью"}
            </p>
          </div>
          <span className={cn("chip shrink-0", isBoost ? "chip-accent" : "")}>
            {aprLabel}
          </span>
        </div>

        <div className="hairline-top" />

        <div className="grid grid-cols-2">
          <div className="px-3 py-3">
            <p className="text-[10px] text-muted">За сутки</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-success">
              +{formatTON(stats.active_daily_yield_nanoton)}
            </p>
          </div>
          <div className="border-l border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] px-3 py-3">
            <p className="text-[10px] text-muted">В стейке</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {stats.staked_count}
              <span className="text-muted">/{stats.total_count}</span>
            </p>
          </div>
        </div>

        {hasPortfolio && unstakedCount > 0 && unlockableDailyYield > 0 ? (
          <>
            <div className="hairline-top" />
            <div className="space-y-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted">Потенциал</span>
                <span className="inline-flex items-center gap-1 tabular-nums text-accent">
                  +
                  <TonAmount
                    amount={formatTON(unlockableDailyYield)}
                    variant="brand"
                    iconClassName="h-3.5 w-3.5"
                  />
                  /сутки
                </span>
              </div>
              <ProgressBar
                value={
                  stats.active_daily_yield_nanoton /
                  (stats.active_daily_yield_nanoton + unlockableDailyYield)
                }
              />
              <p className="text-[11px] text-muted">
                Ещё {pluralizeGifts(unstakedCount)} вне стейка
              </p>
            </div>
          </>
        ) : null}

      </section>

      <section className="panel space-y-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Flame className={cn("h-3.5 w-3.5", streakBonusActive ? "text-success" : "text-accent")} />
            {streakBonusActive ? "Бонус серии" : "Серия"}
          </p>
          <span className="text-xs tabular-nums text-muted">
            {streakBonusActive
              ? `×${stats.streak_bonus_multiplier ?? 2}`
              : `${streakCurrent}/${streakTarget}`}
          </span>
        </div>
        {!streakBonusActive ? <ProgressBar value={streakProgress} tone="success" /> : null}
        <p className="text-[11px] leading-relaxed text-muted">
          {stakingStreakHint(
            streakCurrent,
            streakTarget,
            streakBonusActive,
            streakBonusDaysRemaining,
          )}
        </p>
        {!stats.staked_today && !streakBonusActive && streakCurrent > 0 ? (
          <p className="text-[11px] font-medium text-accent">
            Застейкайте сегодня, чтобы не сбросить серию
          </p>
        ) : null}
      </section>

      {tvlCap > 0 || personalLimit > 0 ? (
        <section className="panel space-y-3.5 p-3.5">
          {tvlCap > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted">Пул</span>
                <span className="tabular-nums text-foreground">
                  {Math.min(100, Math.round((tvlUsed / tvlCap) * 100))}% заполнено
                </span>
              </div>
              <ProgressBar value={tvlUsed / tvlCap} tone={poolFull ? "danger" : "accent"} />
              {poolFull ? (
                <p className="text-[11px] font-medium text-danger">Пул заполнен</p>
              ) : null}
            </div>
          ) : null}

          {personalLimit > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted">Личный лимит</span>
                <span className="tabular-nums text-foreground">
                  {formatTON(personalUsed)} / {formatTON(personalLimit)}
                </span>
              </div>
              <ProgressBar value={personalUsed / personalLimit} />
            </div>
          ) : null}
        </section>
      ) : null}

      {stats.referral_perk_pending ? (
        <section className="panel bg-accent/5 p-3.5">
          <p className="text-sm font-medium">Бонус по реферальной ссылке</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Застейкайте первый подарок — включится +{stats.referral_boost_percent ?? 0.5}% к доходу
            и +{Math.round((stats.referral_limit_bonus_nanoton ?? 20_000_000_000) / 1_000_000_000)} TON
            к лимиту на 30 дней.
          </p>
        </section>
      ) : null}

      {stats.referral_perk_active ? (
        <p className="inline-flex items-center gap-1.5 px-0.5 text-xs text-success">
          <Sparkles className="h-3.5 w-3.5" />
          Реферальный бонус: +{stats.referral_boost_percent ?? 0.5}% к доходу, +
          {Math.round((stats.referral_limit_bonus_nanoton ?? 0) / 1_000_000_000)} TON к лимиту
        </p>
      ) : null}

      {!isBoost && stats.boost_referral_target > 0 ? (
        <section className="panel space-y-2 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Буст {formatStakingRate("boost")}
            </p>
            <span className="text-xs tabular-nums text-muted">
              {Math.min(stats.boost_referral_count, stats.boost_referral_target)}/
              {stats.boost_referral_target}
            </span>
          </div>
          <ProgressBar value={boostPct} />
          <p className="text-[11px] leading-relaxed text-muted">
            {stakingBoostHint(stats.boost_referral_target)}
          </p>
        </section>
      ) : null}

      {isBoost ? (
        <p className="inline-flex items-center gap-1.5 px-0.5 text-xs text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          {aprLabel} до конца месяца
        </p>
      ) : null}
    </div>
  );
}
