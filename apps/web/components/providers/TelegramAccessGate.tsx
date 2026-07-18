"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { flushAnalyticsEvents, trackEvent } from "@/lib/analytics";
import { TelegramGateScreen } from "@/src/widgets/telegram-gate/ui/TelegramGateScreen";
import { AppSplashScreen } from "@/src/widgets/app-shell/ui/AppSplashScreen";
import { useTelegramAccess } from "@/src/shared/hooks/useTelegramAccess";
import { getTelegramWebApp } from "@/src/shared/lib/twa";

export function TelegramAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { checking, allowed } = useTelegramAccess();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (checking || allowed || trackedRef.current) return;
    trackedRef.current = true;

    const webApp = getTelegramWebApp();
    trackEvent({
      event_name: "telegram_access_denied",
      event_category: "acquisition",
      status: "info",
      error_code: "browser_access_blocked",
      path: pathname,
      screen: pathname,
      properties: {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        in_telegram_webapp: !!webApp,
        has_init_data: false,
        platform: webApp?.platform ?? "browser",
      },
    });
    void flushAnalyticsEvents();
  }, [allowed, checking, pathname]);

  if (checking) {
    return <AppSplashScreen showRecovery />;
  }

  if (!allowed) {
    return <TelegramGateScreen />;
  }

  return children;
}
