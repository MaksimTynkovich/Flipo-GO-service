"use client";

import { PropsWithChildren, useEffect } from "react";
import { initTelegramWebApp } from "@/src/shared/lib/twa";
import { useTelegramTheme } from "@/src/shared/hooks/useTelegramTheme";
import { useTelegramSafeArea } from "@/src/shared/hooks/useTelegramSafeArea";

export function TelegramProvider({ children }: PropsWithChildren) {
  useTelegramTheme();
  useTelegramSafeArea();

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  return <>{children}</>;
}
