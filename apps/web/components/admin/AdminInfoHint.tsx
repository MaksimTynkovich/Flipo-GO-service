"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  hint: string;
};

export function AdminInfoHint({ label, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-raised text-[10px] text-muted transition hover:text-foreground active:scale-95"
        aria-label={`Что означает ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/30 px-4 pt-24 backdrop-blur-[1px]">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Закрыть подсказку"
                onClick={() => setOpen(false)}
              />
              <div className="relative w-full max-w-sm animate-[adminHintIn_180ms_ease-out] rounded-2xl border border-[var(--border)] bg-surface px-4 py-3 text-left shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-muted transition hover:text-foreground"
                    onClick={() => setOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
