"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { trackModalAbandon, trackModalOpen } from "@/lib/analytics";

type Props = {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  analyticsModalId?: string;
};

export function ModalOverlay({ onClose, children, className, analyticsModalId }: Props) {
  const [mounted, setMounted] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (analyticsModalId) {
      trackModalOpen(analyticsModalId);
    }
    return () => {
      document.body.style.overflow = prev;
      if (analyticsModalId && !closedRef.current) {
        trackModalAbandon(analyticsModalId);
      }
    };
  }, [analyticsModalId]);

  function handleClose() {
    if (analyticsModalId && !closedRef.current) {
      trackModalAbandon(analyticsModalId);
      closedRef.current = true;
    }
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed left-0 right-0 bottom-0 z-[100] flex flex-col justify-end bg-black/55 backdrop-blur-sm",
        className,
      )}
      style={{
        top: "calc(-1 * env(safe-area-inset-top, 0px))",
        height: "calc(100dvh + env(safe-area-inset-top, 0px))",
      }}
    >
      <button type="button" aria-label="Закрыть" className="absolute inset-0" onClick={handleClose} />
      {children}
    </div>,
    document.body,
  );
}
