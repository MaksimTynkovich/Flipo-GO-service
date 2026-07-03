"use client";

import { useEffect, useRef, useState } from "react";
import { CrashHistoryEntry } from "@/lib/api";
import { TIER_COLORS, formatMultiplier, multiplierTier } from "@/lib/crash";
import { cn } from "@/lib/utils";

const CHIP_W = 44;
const CHIP_GAP = 5;
const ELLIPSIS_W = 16;

type Props = {
  history: CrashHistoryEntry[];
};

export function CrashHistory({ history }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(history.length);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const width = el.clientWidth;
      if (width <= 0) return;
      const maxFit = Math.floor((width - ELLIPSIS_W) / (CHIP_W + CHIP_GAP));
      setVisible(Math.max(0, Math.min(history.length, maxFit)));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [history.length]);

  return (
    <div className="space-y-2">
      <p className="section-label">Последние краши</p>
      {history.length === 0 ? (
        <div className="flex h-7 items-center">
          <span className="text-xs text-muted">Пока нет результатов</span>
        </div>
      ) : (
        <div ref={rowRef} className="flex h-7 w-full items-center gap-[5px] overflow-hidden">
          {history.slice(0, visible).map((entry) => {
            const tier = multiplierTier(entry.crash_point);
            return (
              <div
                key={entry.round_number}
                title={`Раунд #${entry.round_number}`}
                style={{ width: CHIP_W, minWidth: CHIP_W }}
                className={cn(
                  "flex h-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums text-white",
                  TIER_COLORS[tier],
                )}
              >
                {formatMultiplier(entry.crash_point).replace("×", "")}
              </div>
            );
          })}
          {visible < history.length && (
            <span className="shrink-0 text-sm text-muted">…</span>
          )}
        </div>
      )}
    </div>
  );
}
