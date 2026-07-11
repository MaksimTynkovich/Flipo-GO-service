"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  title: string;
  subtitle?: string;
  variant?: ToastVariant;
  leaving?: boolean;
};

type ToastContextValue = {
  showToast: (toast: Omit<ToastItem, "id" | "leaving">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const TOAST_TTL_MS = 3000;
const TOAST_EXIT_MS = 180;
const STACK_OFFSET_PX = 4;
const TOAST_HEIGHT_PX = 28;

const VARIANT_STYLES: Record<ToastVariant, { pill: string; text: string }> = {
  success: {
    pill: "bg-success",
    text: "text-white",
  },
  error: {
    pill: "bg-danger",
    text: "text-white",
  },
  info: {
    pill: "bg-[#e8b923]",
    text: "text-[#1a1408]",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const existing = timersRef.current.get(id);
    if (existing) window.clearTimeout(existing);

    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target || target.leaving) return prev;
      return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    });

    const exitTimer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, TOAST_EXIT_MS);
    timersRef.current.set(id, exitTimer);
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, "id" | "leaving">) => {
      const id = Date.now() + Math.random();
      setToasts((prev) =>
        [...prev, { variant: toast.variant ?? "success", ...toast, id }].slice(-MAX_VISIBLE),
      );
      const ttlTimer = window.setTimeout(() => dismissToast(id), TOAST_TTL_MS);
      timersRef.current.set(id, ttlTimer);
    },
    [dismissToast],
  );

  const visible = toasts.slice(-MAX_VISIBLE);
  const stackHeight =
    visible.length > 0
      ? TOAST_HEIGHT_PX + Math.max(0, visible.length - 1) * STACK_OFFSET_PX
      : 0;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed left-0 right-0 z-[60] flex justify-center pl-[var(--app-safe-left)] pr-[var(--app-safe-right)]"
        style={{ top: "var(--app-safe-top)", height: "var(--app-header-height)" }}
      >
        <div className="app-container relative flex h-full items-center justify-center">
          <div className="relative mx-auto w-full" style={{ height: stackHeight }}>
            {visible.map((toast, index) => {
              const variant = toast.variant ?? "success";
              const depth = visible.length - 1 - index;
              const isFront = depth === 0;
              const styles = VARIANT_STYLES[variant];

              return (
                <div
                  key={toast.id}
                  className="absolute inset-x-0 flex justify-center transition-[top,opacity,transform] duration-base ease-out"
                  style={{
                    top: depth * STACK_OFFSET_PX,
                    zIndex: 20 - depth,
                    opacity: toast.leaving ? 0 : 1 - depth * 0.2,
                    transform: `scale(${1 - depth * 0.03})`,
                  }}
                >
                  <div
                    className={cn(
                      "pointer-events-auto mx-auto w-max max-w-full rounded-full px-3.5 py-1.5",
                      styles.pill,
                      isFront && !toast.leaving && "toast-enter",
                      toast.leaving && "toast-exit",
                    )}
                  >
                    <p
                      className={cn(
                        "whitespace-nowrap text-center text-[11px] font-semibold leading-none",
                        styles.text,
                      )}
                    >
                      {toast.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
