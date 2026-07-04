"use client";

import { getTelegramWebApp } from "@/src/shared/lib/twa";

export function useTelegramHaptics() {
  const webApp = getTelegramWebApp();

  return {
    selectionChanged() {
      webApp?.HapticFeedback?.selectionChanged?.();
    },
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
      webApp?.HapticFeedback?.impactOccurred?.(style);
    },
    notificationOccurred(type: "error" | "success" | "warning") {
      webApp?.HapticFeedback?.notificationOccurred?.(type);
    },
  };
}
