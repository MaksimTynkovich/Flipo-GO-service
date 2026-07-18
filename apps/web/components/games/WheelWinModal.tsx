"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TonIcon } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";

type WheelWinModalProps = {
  amount: string;
  onClose: () => void;
};

export function WheelWinModal({ amount, onClose }: WheelWinModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const main = document.querySelector<HTMLElement>(".app-frame__main");
    const prevMain = main?.style.overflow ?? "";
    if (main) main.style.overflow = "hidden";

    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setOpen(true));
    });

    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
      document.body.style.overflow = prev;
      if (main) main.style.overflow = prevMain;
    };
  }, []);

  function claim() {
    setOpen(false);
    window.setTimeout(onClose, 280);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn("wheel-win-modal", open && "wheel-win-modal--open")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wheel-win-title"
    >
      <button
        type="button"
        className="wheel-win-modal__backdrop"
        aria-label="Закрыть"
        onClick={claim}
      />

      <div className="wheel-win-modal__card">
        <div className="wheel-win-modal__ton" aria-hidden>
          <span className="wheel-win-modal__ton-aura" />
          <span className="wheel-win-modal__ton-ring" />
          <span className="wheel-win-modal__ton-shine" />
          <TonIcon variant="brand" className="wheel-win-modal__ton-icon" title="TON" />
        </div>

        <p id="wheel-win-title" className="wheel-win-modal__title">
          Вы выиграли{" "}
          <span className="wheel-win-modal__amount">{amount} TON</span>!
        </p>

        <button type="button" className="wheel-win-modal__cta app-control" onClick={claim}>
          Забрать приз
        </button>
      </div>
    </div>,
    document.body,
  );
}
