"use client";

import { formatTON, type StakingQuestProgress, type StakingQuestsResponse } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";
import { Check, Target } from "lucide-react";

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
      <div
        className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatProgress(quest: StakingQuestProgress): string {
  if (quest.progress_target <= 1) {
    return quest.completed ? "Выполнено" : "Не выполнено";
  }
  // Count-based quests (matches / referrals) use small integer targets.
  if (quest.progress_target <= 100 && !quest.code.includes("wager") && !quest.code.includes("deposit")) {
    return `${quest.progress_current} / ${quest.progress_target}`;
  }
  return `${formatTON(quest.progress_current)} / ${formatTON(quest.progress_target)} TON`;
}

type Props = {
  data: StakingQuestsResponse | null;
  loading?: boolean;
};

export function StakingQuestsBlock({ data, loading }: Props) {
  if (loading && !data) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-raised" />;
  }
  if (!data) return null;

  const limitPct =
    data.personal_limit_nanoton > 0
      ? data.personal_used_nanoton / data.personal_limit_nanoton
      : 0;

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Target className="h-4 w-4 text-accent" />
            Задания
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Расширьте личный лимит стейкинга — сейчас{" "}
            <span className="tabular-nums text-foreground">
              {formatTON(data.personal_limit_nanoton)} TON
            </span>
            .
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">
          до {formatTON(data.max_limit_nanoton)}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>Использовано</span>
          <span className="tabular-nums">
            {formatTON(data.personal_used_nanoton)} / {formatTON(data.personal_limit_nanoton)} TON
          </span>
        </div>
        <ProgressBar value={limitPct} />
      </div>

      <ul className="space-y-2">
        {data.quests.map((quest) => (
          <li
            key={quest.code}
            className={cn(
              "rounded-xl px-3 py-2.5",
              quest.completed ? "bg-success/8" : "bg-surface-raised",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{quest.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {quest.description}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {quest.completed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                    <Check className="h-3.5 w-3.5" />
                    +{formatTON(quest.reward_limit_nanoton)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-accent">
                    +
                    <TonAmount
                      amount={formatTON(quest.reward_limit_nanoton)}
                      variant="brand"
                      iconClassName="h-3.5 w-3.5"
                    />
                  </span>
                )}
              </div>
            </div>
            {!quest.completed ? (
              <div className="mt-2 space-y-1">
                <ProgressBar value={quest.progress_ratio} />
                <p className="text-[10px] tabular-nums text-muted">{formatProgress(quest)}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
