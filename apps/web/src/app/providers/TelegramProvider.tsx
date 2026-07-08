"use client";

import { PropsWithChildren, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getScreenContext } from "@/src/shared/config/navigation";
import { useAppBackNavigation } from "@/src/shared/hooks/useAppBackNavigation";
import { useTelegramBackButton } from "@/src/shared/hooks/useTelegramBackButton";
import { initTelegramWebApp } from "@/src/shared/lib/twa";
import { useTelegramTheme } from "@/src/shared/hooks/useTelegramTheme";
import { useTelegramSafeArea } from "@/src/shared/hooks/useTelegramSafeArea";

function TelegramNavigationSync() {
  const pathname = usePathname();
  const screen = getScreenContext(pathname);
  const handleBack = useAppBackNavigation(screen);

  useTelegramBackButton(screen, handleBack);

  return null;
}

export function TelegramProvider({ children }: PropsWithChildren) {
  useTelegramTheme();
  useTelegramSafeArea();

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  return (
    <>
      <TelegramNavigationSync />
      {children}
    </>
  );
}
