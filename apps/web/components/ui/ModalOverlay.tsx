"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { trackModalAbandon, trackModalOpen } from "@/lib/analytics";

const EXIT_MS = 300;

type Props = {
  onClose: () => void;
  children: (close: () => void) => React.ReactNode;
  className?: string;
  analyticsModalId?: string;
};

export function ModalOverlay({ onClose, children, className, analyticsModalId }: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const closedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (analyticsModalId) {
      trackModalOpen(analyticsModalId);
    }

    const frame = window.requestAnimationFrame(() => setOpen(true));

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
      if (analyticsModalId && !closedRef.current) {
        trackModalAbandon(analyticsModalId);
      }
    };
  }, [analyticsModalId]);

  function handleClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    if (analyticsModalId) {
      trackModalAbandon(analyticsModalId);
    }
    setOpen(false);
    exitTimerRef.current = window.setTimeout(() => onClose(), EXIT_MS);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed left-0 right-0 bottom-0 z-[100] flex flex-col justify-end",
        className,
      )}
      style={{
        top: "calc(-1 * env(safe-area-inset-top, 0px))",
        height: "calc(100dvh + env(safe-area-inset-top, 0px))",
      }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className={cn("overlay-backdrop absolute inset-0", open && "overlay-backdrop-open")}
        onClick={handleClose}
      />
      <div className={cn("overlay-sheet-host relative z-[1] w-full", open && "overlay-sheet-host-open")}>
        {children(handleClose)}
      </div>
    </div>,
    document.body,
  );
}
