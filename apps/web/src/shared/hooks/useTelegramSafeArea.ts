"use client";

import { useLayoutEffect } from "react";
import {
  applyTelegramSafeAreaToDocument,
  getTelegramWebApp,
} from "@/src/shared/lib/twa";

const SYNC_DELAYS_MS = [0, 50, 150, 400, 800];

function resetWindowScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function useTelegramSafeArea() {
  useLayoutEffect(() => {
    const sync = () => {
      applyTelegramSafeAreaToDocument();
      resetWindowScroll();
    };

    sync();

    const raf = requestAnimationFrame(sync);
    const timers = SYNC_DELAYS_MS.map((delay) => window.setTimeout(sync, delay));

    const webApp = getTelegramWebApp();
    webApp?.onEvent?.("contentSafeAreaChanged", sync);
    webApp?.onEvent?.("safeAreaChanged", sync);
    webApp?.onEvent?.("fullscreenChanged", sync);
    webApp?.onEvent?.("viewportChanged", sync);

    const vv = window.visualViewport;
    const onVisualViewport = () => {
      applyTelegramSafeAreaToDocument();
      // iOS/Telegram may shift the visual viewport when focusing inputs —
      // pin the document so the app frame is not lifted with the keyboard.
      resetWindowScroll();
    };
    vv?.addEventListener("resize", onVisualViewport);
    vv?.addEventListener("scroll", onVisualViewport);
    window.addEventListener("orientationchange", sync);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      webApp?.offEvent?.("contentSafeAreaChanged", sync);
      webApp?.offEvent?.("safeAreaChanged", sync);
      webApp?.offEvent?.("fullscreenChanged", sync);
      webApp?.offEvent?.("viewportChanged", sync);
      vv?.removeEventListener("resize", onVisualViewport);
      vv?.removeEventListener("scroll", onVisualViewport);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);
}
