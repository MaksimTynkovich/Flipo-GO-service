"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  flushAnalyticsEvents,
  flushCurrentScreenExit,
  getAnalyticsSessionId,
  installClientErrorLogging,
  resumeCurrentScreen,
  rotateAnalyticsSessionIfNeeded,
  trackEvent,
  trackScreenView,
} from "@/lib/analytics";

function trackSessionStarted(reason: string) {
  trackEvent({
    event_name: "session_started",
    event_category: "acquisition",
    status: "success",
    properties: {
      reason,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    },
  });
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    installClientErrorLogging();
    // Always treat cold mount as a visit; rotate if previous session went idle.
    rotateAnalyticsSessionIfNeeded(true);
    getAnalyticsSessionId();
    trackSessionStarted("mount");

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentScreenExit("tab_hidden");
        void flushAnalyticsEvents();
        return;
      }
      // Returning to the Mini App after idle = repeat visit.
      if (rotateAnalyticsSessionIfNeeded(false)) {
        trackSessionStarted("resume");
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
