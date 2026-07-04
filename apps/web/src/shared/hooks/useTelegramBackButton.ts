"use client";

import { useEffect } from "react";
import { getTelegramWebApp } from "@/src/shared/lib/twa";
import { type ScreenContext } from "@/src/shared/config/navigation";

export function useTelegramBackButton(context: ScreenContext, onBack: () => void) {
  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;

    if (!backButton) {
      return;
    }

    if (context.level !== "stack") {
      backButton.hide();
      return;
    }

    backButton.show();
    backButton.onClick(onBack);

    return () => {
      backButton.offClick(onBack);
      backButton.hide();
    };
  }, [context.level, onBack]);
}
