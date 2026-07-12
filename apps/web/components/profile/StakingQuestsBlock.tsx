"use client";

import { formatTON, type StakingQuestProgress, type StakingQuestsResponse } from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
      <div
        className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatProgress(quest: StakingQuestProgress): string {
  if (quest.progress_target <= 1) {
    return quest.completed ? "Готово" : "0 / 1";
  }
  if (
    quest.progress_target <= 100 &&
    !quest.code.includes("wager") &&
    !quest.code.includes("deposit")
  ) {
    return `${quest.progress_current} / ${quest.progress_target}`;
  }
  return `${formatTON(quest.progress_current)} / ${formatTON(quest.progress_target)}`;
}

type Props = {
  data: StakingQuestsResponse | null;
  loading?: boolean;
};

export function StakingQuestsBlock({ data, loading }: Props) {
  if (loading && !data) {
    return <div className="h-36 animate-pulse rounded-2xl bg-surface-raised" />;
  }
  if (!data) return null;

  const doneCount = data.quests.filter((q) => q.completed).length;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="section-label">Задания</p>
          <p className="mt-1 text-sm text-muted">
            Лимит{" "}
            <span className="tabular-nums text-foreground">
              {formatTON(data.personal_limit_nanoton)}
            </span>
            <span className="text-muted"> / {formatTON(data.max_limit_nanoton)}</span>
          </p>
        </div>
        <span className="text-[11px] tabular-nums text-muted">
          {doneCount}/{data.quests.length}
        </span>
      </div>

      <ul className="panel divide-y divide-[color-mix(in_srgb,var(--foreground)_8%,transparent)] overflow-hidden p-0">
        {data.quests.map((quest) => (
          <li key={quest.code} className="px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium leading-snug",
                    quest.completed && "text-muted",
                  )}
                >
                  {quest.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {quest.description}
                </p>
              </div>
              <div className="shrink-0 pt-0.5 text-right">
                {quest.completed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    +{formatTON(quest.reward_limit_nanoton)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-accent">
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
