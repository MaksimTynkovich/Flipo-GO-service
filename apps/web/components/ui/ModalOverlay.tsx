"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

export function ModalOverlay({ onClose, children, className }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      <button type="button" aria-label="Закрыть" className="absolute inset-0" onClick={onClose} />
      {children}
    </div>,
    document.body,
  );
}
