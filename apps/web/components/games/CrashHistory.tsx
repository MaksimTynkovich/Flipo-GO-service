"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { CrashHistoryEntry } from "@/lib/api";
import { formatMultiplierCompact, historyTierStyle } from "@/lib/crash";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 24;

type Props = {
  history: CrashHistoryEntry[];
  onSelectRound?: (entry: CrashHistoryEntry) => void;
  /** Overlay on chart — absolute, doesn't steal layout space. */
  overlay?: boolean;
  className?: string;
};

export function CrashHistory({ history, onSelectRound, overlay = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const recent = history.slice(0, HISTORY_LIMIT);
  const last = recent[0];
  const lastTier = last ? historyTierStyle(last.crash_point) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="История раундов"
        className={cn(
          "app-control inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold",
          overlay
            ? "bg-black/45 text-white/90 backdrop-blur-md ring-1 ring-white/10"
            : "bg-surface text-muted",
          className,
        )}
      >
        <History className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} />
        <span className={overlay ? "text-white/55" : "text-muted/90"}>История</span>
        {last && lastTier ? (
          <span className={cn("tabular-nums", lastTier.value)}>
            {formatMultiplierCompact(last.crash_point)}×
          </span>
        ) : (
          <span className={overlay ? "text-white/40" : "text-muted"}>—</span>
        )}
      </button>

      {open ? (
        <ModalOverlay onClose={() => setOpen(false)} analyticsModalId="crash_history">
          {(close) => (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="История Crash"
              className="sheet-panel relative mx-auto flex w-full max-w-lg max-h-[min(78dvh,100%)] flex-col"
            >
              <div className="shrink-0 px-4 pt-2">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
                <div className="relative flex items-center justify-center pb-3">
                  <p className="text-[15px] font-semibold">История раундов</p>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Закрыть"
                    className="absolute right-0 flex size-8 items-center justify-center rounded-full text-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="pb-3 text-center text-xs text-muted">
                  Нажмите на множитель, чтобы проверить честность раунда
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {recent.length === 0 ? (
                  <p className="rounded-xl bg-surface-raised/60 px-3 py-8 text-center text-sm text-muted">
                    История пуста
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {recent.map((entry) => {
                      const tier = historyTierStyle(entry.crash_point);
                      const clickable = !!entry.round_id && !!onSelectRound;
                      return (
                        <button
                          key={entry.round_id || entry.round_number}
                          type="button"
                          title={`Раунд #${entry.round_number}`}
                          disabled={!clickable}
                          onClick={() => {
                            if (!clickable) return;
                            onSelectRound?.(entry);
                            close();
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl bg-surface-raised/70 px-2 py-2.5 text-center transition active:opacity-70",
                            !clickable && "opacity-60",
                          )}
                        >
                          <span className={cn("text-sm font-bold tabular-nums leading-none", tier.value)}>
                            {formatMultiplierCompact(entry.crash_point)}×
                          </span>
                          <span className="text-[10px] tabular-nums text-muted">
                            #{entry.round_number}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </ModalOverlay>
      ) : null}
    </>
  );
}
