"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  hint: string;
};

const EXIT_MS = 280;

export function AdminInfoHint({ label, hint }: Props) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        closeHint();
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeHint();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  function openHint() {
    setVisible(true);
    window.requestAnimationFrame(() => setOpen(true));
  }

  function closeHint() {
    setOpen(false);
    exitTimerRef.current = window.setTimeout(() => setVisible(false), EXIT_MS);
  }

  function toggleHint() {
    if (visible) {
      closeHint();
    } else {
      openHint();
    }
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-raised text-[10px] text-muted transition hover:text-foreground active:scale-95"
        aria-label={`Что означает ${label}`}
        aria-expanded={open}
        onClick={toggleHint}
      >
        i
      </button>
      {visible
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-24">
              <button
                type="button"
                className={`overlay-backdrop absolute inset-0 ${open ? "overlay-backdrop-open" : ""}`}
                aria-label="Закрыть подсказку"
                onClick={closeHint}
              />
              <div
                className={`overlay-popover-host relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-surface px-4 py-3 text-left ${
                  open ? "overlay-popover-host-open" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-muted transition hover:text-foreground"
                    onClick={closeHint}
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
