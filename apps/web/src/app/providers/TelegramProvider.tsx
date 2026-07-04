"use client";

import { PropsWithChildren, useEffect } from "react";
import { getTelegramWebApp } from "@/src/shared/lib/twa";
import { useTelegramTheme } from "@/src/shared/hooks/useTelegramTheme";

export function TelegramProvider({ children }: PropsWithChildren) {
  useTelegramTheme();

  useEffect(() => {
    const webApp = getTelegramWebApp();

    webApp?.ready();
    webApp?.expand();
  }, []);

  return <>{children}</>;
}
