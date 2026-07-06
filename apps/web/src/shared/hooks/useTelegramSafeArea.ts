"use client";

import { useLayoutEffect } from "react";
import {
  applyTelegramSafeAreaToDocument,
  getTelegramWebApp,
} from "@/src/shared/lib/twa";

const SYNC_DELAYS_MS = [0, 50, 150, 400, 800];

export function useTelegramSafeArea() {
  useLayoutEffect(() => {
    const sync = () => applyTelegramSafeAreaToDocument();

    sync();

    const raf = requestAnimationFrame(sync);
    const timers = SYNC_DELAYS_MS.map((delay) => window.setTimeout(sync, delay));

    const webApp = getTelegramWebApp();
    webApp?.onEvent?.("contentSafeAreaChanged", sync);
    webApp?.onEvent?.("safeAreaChanged", sync);
    webApp?.onEvent?.("fullscreenChanged", sync);
    webApp?.onEvent?.("viewportChanged", sync);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      webApp?.offEvent?.("contentSafeAreaChanged", sync);
      webApp?.offEvent?.("safeAreaChanged", sync);
      webApp?.offEvent?.("fullscreenChanged", sync);
      webApp?.offEvent?.("viewportChanged", sync);
    };
  }, []);
}
