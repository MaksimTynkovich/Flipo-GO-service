"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CrashHistoryEntry } from "@/lib/api";
import { formatMultiplierCompact } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  history: CrashHistoryEntry[];
  onSelectRound?: (entry: CrashHistoryEntry) => void;
  className?: string;
};

function tierTone(mult: number): "crash" | "low" | "mid" | "high" | "moon" {
  if (mult >= 10) return "moon";
  if (mult >= 5) return "high";
  if (mult >= 2) return "mid";
  if (mult < 1.35) return "crash";
  return "low";
}

function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function countFitting(
  labels: string[],
  availablePx: number,
  latestFont: string,
  regularFont: string,
  gapPx: number,
): number {
  if (availablePx <= 0 || labels.length === 0) return 0;

  let used = 0;
  let count = 0;

  for (let i = 0; i < labels.length; i++) {
    const font = i === 0 ? latestFont : regularFont;
    const chip = measureTextWidth(labels[i], font);
    const next = count === 0 ? chip : used + gapPx + chip;
    if (next > availablePx + 0.5) break;
    used = next;
    count += 1;
  }

  return count;
}

export function CrashHistory({ history, onSelectRound, className }: Props) {
  const [fitCount, setFitCount] = useState(8);
  const rowRef = useRef<HTMLDivElement>(null);

  const labels = useMemo(
    () => history.map((entry) => `${formatMultiplierCompact(entry.crash_point)}×`),
    [history],
  );

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function readFonts() {
      const probe = document.createElement("span");
      probe.className = "crash-history__mult";
      probe.style.cssText =
        "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
      probe.textContent = "1.00×";
      document.body.appendChild(probe);
      const regular = getComputedStyle(probe);
      const regularFont = `${regular.fontWeight} ${regular.fontSize} ${regular.fontFamily}`;
      probe.classList.add("crash-history__mult--latest");
      const latest = getComputedStyle(probe);
      const latestFont = `${latest.fontWeight} ${latest.fontSize} ${latest.fontFamily}`;
      probe.remove();
      return { regularFont, latestFont };
    }

    function recalc() {
      const el = rowRef.current;
      if (!el) return;
      const { regularFont, latestFont } = readFonts();
      const styles = getComputedStyle(el);
      const pad =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const width = el.clientWidth - pad;
      const next = countFitting(labels, width, latestFont, regularFont, 10);
      setFitCount((prev) => (prev === next ? prev : Math.max(next, 1)));
    }

    recalc();
    const ro = new ResizeObserver(() => recalc());
    ro.observe(row);
    return () => ro.disconnect();
  }, [labels]);

  const visible = history.slice(0, fitCount);

  return (
    <div className={cn("crash-history", className)}>
      <div className="crash-history__fade" aria-hidden />
      <div ref={rowRef} className="crash-history__row">
        {visible.length === 0 ? (
          <span className="crash-history__empty">Нет игр</span>
        ) : (
          visible.map((entry, index) => {
            const clickable = !!entry.round_id && !!onSelectRound;
            return (
              <button
                key={entry.round_id || entry.round_number}
                type="button"
                title={`Раунд #${entry.round_number}`}
                disabled={!clickable}
                onClick={() => clickable && onSelectRound?.(entry)}
                data-tone={tierTone(entry.crash_point)}
                className={cn(
                  "crash-history__mult",
                  index === 0 && "crash-history__mult--latest",
                  !clickable && "opacity-50",
                )}
              >
                {formatMultiplierCompact(entry.crash_point)}×
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
