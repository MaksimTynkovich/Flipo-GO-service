"use client";

import { CrashHistoryEntry } from "@/lib/api";
import { formatMultiplierCompact, historyBadgeClass } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  history: CrashHistoryEntry[];
  embedded?: boolean;
};

export function CrashHistory({ history, embedded }: Props) {
  if (history.length === 0) {
    return (
      <div className={cn("px-4 py-3", !embedded && "space-y-2")}>
        {!embedded && <p className="section-label">История</p>}
        <span className="text-xs text-muted">Пока нет результатов</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        embedded && "border-t border-white/[0.06] bg-black/20",
        !embedded && "space-y-2",
      )}
    >
      {!embedded && <p className="section-label px-0.5">История</p>}
      <div
        className={cn(
          "scrollbar-none flex gap-2 overflow-x-auto",
          embedded ? "px-3 py-3" : "px-0.5 pb-0.5",
        )}
      >
        {history.map((entry, i) => (
          <div
            key={entry.round_number}
            title={`Раунд #${entry.round_number}`}
            className={cn(
              "flex h-9 min-w-[64px] shrink-0 items-center justify-center rounded-xl border px-2.5",
              "text-[11px] font-bold tabular-nums tracking-tight backdrop-blur-sm",
              "transition-transform duration-200",
              i === 0 && "scale-[1.02]",
              historyBadgeClass(entry.crash_point),
            )}
          >
            {formatMultiplierCompact(entry.crash_point)}×
          </div>
        ))}
      </div>
    </div>
  );
}
