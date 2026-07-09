"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  flushAnalyticsEvents,
  flushCurrentScreenExit,
  getAnalyticsSessionId,
  installClientErrorLogging,
  resumeCurrentScreen,
  trackEvent,
  trackScreenView,
} from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    installClientErrorLogging();
    getAnalyticsSessionId();
    trackEvent({
      event_name: "session_started",
      event_category: "acquisition",
      status: "success",
      properties: {
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentScreenExit("tab_hidden");
        void flushAnalyticsEvents();
        return;
      }
      resumeCurrentScreen();
    };
    const onBeforeUnload = () => {
      flushCurrentScreenExit("unload");
      void flushAnalyticsEvents();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    trackScreenView(pathname);
  }, [pathname]);

  return <>{children}</>;
}
