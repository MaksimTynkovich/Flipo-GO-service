"use client";

export type FlipoBootStage =
  | "script"
  | "react"
  | "auth_started"
  | "app_ready"
  | "auth_failed";

type FlipoBootState = {
  t0: number;
  ready: boolean;
  hangReported: boolean;
  stages: Partial<Record<FlipoBootStage, number>>;
  mark: (stage: FlipoBootStage) => void;
  reportHang: (reason: string, extra?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    __flipoBoot?: FlipoBootState;
  }
}

/** Mark a boot milestone; cancels hang watchdog when app_ready. */
export function markBootStage(stage: FlipoBootStage) {
  if (typeof window === "undefined") return;
  window.__flipoBoot?.mark(stage);
}

/** Log hang without injecting the DOM recovery overlay (React splash handles UX). */
export function reportBootHang(reason: string, extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.__flipoBoot?.reportHang(reason, { ...extra, skip_ui: true });
}
