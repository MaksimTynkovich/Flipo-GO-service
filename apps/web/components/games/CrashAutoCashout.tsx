"use client";

import { CRASH_AUTO_PRESETS } from "@/lib/crash";
import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  target: string;
  onTargetChange: (value: string) => void;
  disabled?: boolean;
};

export function CrashAutoCashout({
  enabled,
  onEnabledChange,
  target,
  onTargetChange,
  disabled,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-raised/60 px-3 py-2.5 transition-opacity",
        disabled && "opacity-50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnabledChange(!enabled)}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
              enabled ? "bg-accent" : "bg-surface",
            )}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white transition-transform duration-200",
                enabled ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Автовывод</span>
            <span className="block text-[11px] text-muted">Забрать при достижении ×</span>
          </span>
        </button>

        <div
          className={cn(
            "flex h-9 w-[5.5rem] items-center rounded-lg bg-surface px-2 transition-opacity",
            !enabled && "pointer-events-none opacity-40",
          )}
        >
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled || !enabled}
            value={target}
            onChange={(e) => onTargetChange(e.target.value.replace(/[^\d.]/g, ""))}
            className="w-full bg-transparent text-right text-sm font-semibold tabular-nums outline-none"
            aria-label="Множитель автовывода"
          />
          <span className="ml-0.5 text-xs text-muted">×</span>
        </div>
      </div>

      {enabled ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CRASH_AUTO_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onTargetChange(preset)}
              className={cn(
                "h-7 rounded-lg px-2.5 text-[11px] font-semibold tabular-nums transition-colors",
                target === preset
                  ? "bg-accent/20 text-accent"
                  : "bg-surface text-muted hover:text-foreground",
              )}
            >
              {preset}×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
