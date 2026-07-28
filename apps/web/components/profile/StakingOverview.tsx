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
  STAKING_STREAK_BONUS_MULTIPLIER,
  STAKING_STREAK_TARGET_DAYS,
} from "@/lib/staking-ui";
import { cn } from "@/lib/utils";
import { Check, Flame, Sparkles } from "lucide-react";

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

function StreakTrack({
  current,
  target,
  bonusActive,
  stakedToday,
  multiplier,
}: {
  current: number;
  target: number;
  bonusActive: boolean;
  stakedToday: boolean;
  multiplier: number;
}) {
  const days = Math.max(1, target);
  const atRisk = !bonusActive && !stakedToday && current > 0;
  const bonusReady = !bonusActive && current >= target;
  const filledCount = bonusActive ? days : Math.min(current, days);

  return (
    <div
      className="overflow-hidden rounded-2xl bg-surface-raised/70 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_6%,transparent)]"
      aria-label={`Серия ${current} из ${target}`}
    >
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 p-2.5 pr-2">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
            role="list"
          >
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const filled = bonusActive || day <= current;
              const isNext = !bonusActive && day === current + 1;
              const waiting = isNext && atRisk;

              return (
                <div
                  key={day}
                  role="listitem"
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl text-[11px] font-semibold tabular-nums transition-all duration-500",
                    filled && "bg-success text-background",
                    !filled && !waiting && "bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] text-muted",
                    waiting && "bg-accent/20 text-accent ring-1 ring-accent/50",
                    isNext && !waiting && !filled && "ring-1 ring-accent/30",
                  )}
                  style={waiting ? { animation: "live-pulse 1.8s ease-out infinite" } : undefined}
                  aria-label={
                    filled
                      ? `День ${day}: засчитан`
                      : waiting
                        ? `День ${day}: застейкайте сегодня`
                        : `День ${day}`
                  }
                >
                  {filled ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.8} />
                  ) : waiting ? (
                    <Flame className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                  ) : (
                    day
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                bonusActive || bonusReady ? "bg-success" : "bg-[#ff9b5c]",
              )}
              style={{ width: `${Math.min(100, (filledCount / days) * 100)}%` }}
            />
          </div>
        </div>

        <div
          className={cn(
            "flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 border-l px-2 text-center transition-colors duration-500",
            bonusActive
              ? "border-success/25 bg-success/15"
              : bonusReady
                ? "border-success/20 bg-success/10"
                : "border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_3%,transparent)]",
          )}
          style={bonusActive ? { animation: "live-pulse 2.2s ease-out infinite" } : undefined}
          aria-label={bonusActive ? `Бонус ×${multiplier} активен` : `Награда ×${multiplier}`}
        >
          <span
            className={cn(
              "text-lg font-bold leading-none tracking-tight tabular-nums",
              bonusActive || bonusReady ? "text-success" : "text-foreground",
            )}
          >
            ×{multiplier}
          </span>
          <span
            className={cn(
              "text-[9px] font-medium uppercase tracking-[0.06em]",
              bonusActive || bonusReady ? "text-success/80" : "text-muted",
            )}
          >
            {bonusActive ? "сейчас" : "бонус"}
          </span>
        </div>
      </div>
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
  const streakMultiplier =
    stats.streak_bonus_multiplier && stats.streak_bonus_multiplier > 0
      ? stats.streak_bonus_multiplier
      : STAKING_STREAK_BONUS_MULTIPLIER;
  const streakAtRisk = !stats.staked_today && !streakBonusActive && streakCurrent > 0;

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

      <section
        className={cn(
          "panel relative overflow-hidden p-0",
          streakBonusActive && "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--success)_22%,transparent)]",
          streakAtRisk && "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)]",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            streakBonusActive
              ? "bg-[radial-gradient(90%_70%_at_12%_-10%,color-mix(in_srgb,var(--success)_22%,transparent),transparent_55%)]"
              : streakAtRisk
                ? "bg-[radial-gradient(90%_70%_at_12%_-10%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_55%)]"
                : "bg-[radial-gradient(90%_70%_at_12%_-10%,color-mix(in_srgb,#ff8a4c_14%,transparent),transparent_55%)]",
          )}
          aria-hidden
        />

        <div className="relative space-y-3.5 p-3.5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                streakBonusActive
                  ? "bg-success/15 text-success shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_25%,transparent)]"
                  : streakAtRisk
                    ? "bg-accent/15 text-accent shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
                    : "bg-[color-mix(in_srgb,#ff8a4c_16%,transparent)] text-[#ff9b5c] shadow-[0_0_0_1px_color-mix(in_srgb,#ff8a4c_28%,transparent)]",
              )}
            >
              <Flame
                className="h-5 w-5"
                fill="currentColor"
                strokeWidth={0}
                style={
                  streakBonusActive || streakAtRisk
                    ? { animation: "live-pulse 2s ease-out infinite" }
                    : undefined
                }
              />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tracking-tight">
                  {streakBonusActive ? "Бонус серии" : "Серия стейка"}
                </p>
                {streakBonusActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-success">
                    <Sparkles className="h-3 w-3" />
                    ×{streakMultiplier}
                  </span>
                ) : (
                  <span className="text-xs font-medium tabular-nums text-muted">
                    {streakCurrent}
                    <span className="text-muted/70">/{streakTarget}</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {stakingStreakHint(
                  streakCurrent,
                  streakTarget,
                  streakBonusActive,
                  streakBonusDaysRemaining,
                )}
              </p>
            </div>
          </div>

          <StreakTrack
            current={streakCurrent}
            target={streakTarget}
            bonusActive={streakBonusActive}
            stakedToday={Boolean(stats.staked_today)}
            multiplier={streakMultiplier}
          />

          {streakAtRisk ? (
            <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60"
                  style={{ animation: "live-pulse 1.6s ease-out infinite" }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <p className="text-[11px] font-medium leading-snug text-accent">
                Застейкайте сегодня, чтобы не сбросить серию
              </p>
            </div>
          ) : null}

          {streakBonusActive ? (
            <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-success" />
              <p className="text-[11px] font-medium leading-snug text-success">
                Сегодня доход удвоен — не пропустите стейк
              </p>
            </div>
          ) : null}
        </div>
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
