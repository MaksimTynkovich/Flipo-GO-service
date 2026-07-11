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

function readKeyboardInset(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

export function ModalOverlay({ onClose, children, className, analyticsModalId }: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const closedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);
  const scrollLockRef = useRef<{ main: HTMLElement | null; overflow: string }>({
    main: null,
    overflow: "",
  });

  useEffect(() => {
    setMounted(true);
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const main = document.querySelector<HTMLElement>(".app-frame__main");
    scrollLockRef.current = { main, overflow: main?.style.overflow ?? "" };
    if (main) main.style.overflow = "hidden";

    if (analyticsModalId) {
      trackModalOpen(analyticsModalId);
    }

    // Double rAF so the closed transform paints before we open — otherwise the
    // enter transition is skipped or starts mid-frame and feels sticky.
    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setOpen(true));
    });

    function syncKeyboard() {
      setKeyboardInset(readKeyboardInset());
    }
    syncKeyboard();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncKeyboard);
    vv?.addEventListener("scroll", syncKeyboard);
    window.addEventListener("resize", syncKeyboard);

    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
      document.body.style.overflow = prevBody;
      const { main: lockedMain, overflow } = scrollLockRef.current;
      if (lockedMain) lockedMain.style.overflow = overflow;
      vv?.removeEventListener("resize", syncKeyboard);
      vv?.removeEventListener("scroll", syncKeyboard);
      window.removeEventListener("resize", syncKeyboard);
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
        "fixed left-0 right-0 z-[100] flex flex-col justify-end",
        className,
      )}
      style={{
        top: "calc(-1 * env(safe-area-inset-top, 0px))",
        bottom: keyboardInset,
        height: "auto",
        transition: keyboardInset > 0 ? "bottom var(--duration-base) var(--ease-out)" : undefined,
      }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className={cn("overlay-backdrop absolute inset-0", open && "overlay-backdrop-open")}
        onClick={handleClose}
      />
      <div
        className={cn("overlay-sheet-host relative z-[1] w-full", open && "overlay-sheet-host-open")}
      >
        {children(handleClose)}
      </div>
    </div>,
    document.body,
  );
}
