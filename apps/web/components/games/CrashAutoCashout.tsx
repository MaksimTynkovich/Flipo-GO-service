"use client";

import { useState } from "react";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { CRASH_AUTO_PRESETS } from "@/lib/crash";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "app-control flex h-9 w-full items-center justify-between gap-2 rounded-xl px-3 text-left transition-colors",
          enabled
            ? "bg-accent/15 text-accent"
            : "bg-surface-raised text-muted hover:text-foreground",
          disabled && "opacity-50",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              enabled ? "bg-accent" : "bg-muted/50",
            )}
          />
          <span className="truncate text-xs font-semibold">
            {enabled ? `Авто · ${target || "—"}×` : "Автовывод выкл"}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>

      {open ? (
        <ModalOverlay onClose={() => setOpen(false)} analyticsModalId="crash_auto_cashout">
          {(close) => (
            <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-foreground">Автовывод</p>
                  <p className="mt-0.5 text-xs text-muted">Забрать ставку при достижении ×</p>
                </div>
                <button
                  type="button"
                  onClick={() => onEnabledChange(!enabled)}
                  className={cn(
                    "relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors duration-200",
                    enabled ? "bg-accent" : "bg-surface-raised",
                  )}
                  aria-label={enabled ? "Выключить автовывод" : "Включить автовывод"}
                >
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 size-6 rounded-full bg-white transition-transform duration-200",
                      enabled && "translate-x-5",
                    )}
                  />
                </button>
              </div>

              <div
                className={cn(
                  "space-y-3 transition-opacity",
                  !enabled && "pointer-events-none opacity-40",
                )}
              >
                <div className="flex h-12 items-center rounded-xl bg-surface-raised px-3.5">
                  <span className="text-sm text-muted">Цель</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!enabled}
                    value={target}
                    onChange={(e) => onTargetChange(e.target.value.replace(/[^\d.]/g, ""))}
                    className="ml-3 w-full bg-transparent text-right text-lg font-semibold tabular-nums outline-none"
                    aria-label="Множитель автовывода"
                  />
                  <span className="ml-1 text-sm text-muted">×</span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {CRASH_AUTO_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!enabled}
                      onClick={() => {
                        onTargetChange(preset);
                        if (!enabled) onEnabledChange(true);
                      }}
                      className={cn(
                        "h-10 rounded-xl text-xs font-semibold tabular-nums transition-colors",
                        target === preset
                          ? "bg-accent text-white"
                          : "bg-surface-raised text-muted hover:text-foreground",
                      )}
                    >
                      {preset}×
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary mt-5 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold"
                onClick={close}
              >
                Готово
              </button>
            </div>
          )}
        </ModalOverlay>
      ) : null}
    </>
  );
}
