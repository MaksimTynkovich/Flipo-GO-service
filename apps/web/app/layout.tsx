import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { AppLayout } from "@/src/widgets/app-shell/ui/AppLayout";
import { BRAND_BG } from "@/src/shared/config/brand";
import { cn } from "@/lib/utils";

const sans = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flipo",
  description: "Flipo — games, staking & gifts on TON.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  /** Keyboard overlays the UI instead of resizing / lifting the whole app. */
  interactiveWidget: "overlays-content",
  themeColor: BRAND_BG,
};

const tgThemeBootstrap = `
(() => {
  const fallback = "${BRAND_BG}";
  const isTooDark = (hex) => {
    if (!hex) return true;
    const value = hex.replace("#", "");
    const channels =
      value.length === 3
        ? value.split("").map((c) => parseInt(c + c, 16))
        : [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((c) => parseInt(c, 16));
    const luminance =
      channels.reduce((sum, channel) => {
        const normalized = channel / 255;
        const linear =
          normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        return sum + linear;
      }, 0) / 3;
    return luminance < 0.1;
  };

  const apply = () => {
    const params = window.Telegram?.WebApp?.themeParams;
    const bg = isTooDark(params?.bg_color) ? fallback : params?.bg_color || fallback;
    document.documentElement.style.setProperty("--background", bg);
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    window.Telegram?.WebApp?.setBackgroundColor?.(bg);
  };

  apply();
  window.Telegram?.WebApp?.onEvent?.("themeChanged", apply);

  const webApp = window.Telegram?.WebApp;
  if (webApp) {
    const isMobilePlatform = (platform) => {
      const value = (platform || "").toLowerCase();
      return value === "android" || value === "ios";
    };
    const isDesktopPlatform = (platform) => {
      const value = (platform || "").toLowerCase();
      return (
        value === "tdesktop" ||
        value === "macos" ||
        value === "web" ||
        value === "weba" ||
        value.includes("desktop")
      );
    };
    if (webApp.platform) {
      const safePlatform = String(webApp.platform).toLowerCase().replace(/[^a-z0-9_-]/g, "");
      document.documentElement.classList.add("tg-platform-" + safePlatform);
      if (isDesktopPlatform(webApp.platform)) {
        document.documentElement.classList.add("tg-desktop");
      }
    }
    webApp.ready();
    webApp.expand();
    if (isMobilePlatform(webApp.platform)) {
      webApp.disableVerticalSwipes?.();
      try {
        webApp.lockOrientation?.();
      } catch (_) {}
      // NEVER call requestFullscreen on cold open — on many Android/iOS Telegram
      // builds it relaunches or freezes the WebView (app "doesn't open" until
      // Telegram is force-quit). Fullscreen comes from deep-link mode=fullscreen;
      // expand() is enough for a playable viewport.
    }
    const sumInsets = (content, safe) => ({
      top: (content?.top || 0) + (safe?.top || 0),
      bottom: (content?.bottom || 0) + (safe?.bottom || 0),
      left: (content?.left || 0) + (safe?.left || 0),
      right: (content?.right || 0) + (safe?.right || 0),
    });
    const readCssInset = (property) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const mobileHeaderInset = (platform) => {
      const value = (platform || "").toLowerCase();
      if (value.includes("android")) return 48;
      if (value.includes("ios")) return 44;
      return 0;
    };
    const syncInsets = () => {
      const content = webApp.contentSafeAreaInset || {};
      const safe = webApp.safeAreaInset || {};
      const inset = sumInsets(content, safe);
      if (inset.top === 0) {
        inset.top =
          readCssInset("--tg-content-safe-area-inset-top") +
          readCssInset("--tg-safe-area-inset-top");
      }
      if (inset.bottom === 0) {
        inset.bottom =
          readCssInset("--tg-content-safe-area-inset-bottom") +
          readCssInset("--tg-safe-area-inset-bottom");
      }
      if (inset.left === 0) {
        inset.left =
          readCssInset("--tg-content-safe-area-inset-left") + readCssInset("--tg-safe-area-inset-left");
      }
      if (inset.right === 0) {
        inset.right =
          readCssInset("--tg-content-safe-area-inset-right") +
          readCssInset("--tg-safe-area-inset-right");
      }
      const minTop = mobileHeaderInset(webApp.platform);
      if (minTop > 0) inset.top = Math.max(inset.top, minTop);
      const headerOffset = inset.top + 56 + 16;
      const tabbarOffset = inset.bottom + 52 + 16;
      document.documentElement.style.setProperty("--app-safe-top", inset.top + "px");
      document.documentElement.style.setProperty("--app-safe-bottom", inset.bottom + "px");
      document.documentElement.style.setProperty("--app-safe-left", inset.left + "px");
      document.documentElement.style.setProperty("--app-safe-right", inset.right + "px");
      document.documentElement.style.setProperty("--app-header-offset", headerOffset + "px");
      document.documentElement.style.setProperty("--app-tabbar-offset", tabbarOffset + "px");
      const stableH = webApp.viewportStableHeight || window.innerHeight;
      if (stableH > 0) {
        document.documentElement.style.setProperty("--app-height", Math.round(stableH) + "px");
      }
    };
    syncInsets();
    [50, 150, 400, 800].forEach((ms) => window.setTimeout(syncInsets, ms));
    webApp.onEvent?.("contentSafeAreaChanged", syncInsets);
    webApp.onEvent?.("safeAreaChanged", syncInsets);
    webApp.onEvent?.("fullscreenChanged", syncInsets);
    webApp.onEvent?.("viewportChanged", syncInsets);
  }
})();
`;

const bootWatchdog = `
(() => {
  const BOOT_HANG_MS = 10000;
  const ANON_KEY = "flipo_analytics_anonymous_id";
  const SESSION_KEY = "flipo_analytics_session_id";
  const ensureId = (key) => {
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) ||
          ("id_" + Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      return "anon_" + Date.now().toString(36);
    }
  };
  const post = (event) => {
    try {
      const body = JSON.stringify({
        events: [{
          event_name: event.event_name,
          event_category: "acquisition",
          source: "web",
          status: event.status || "error",
          error_code: event.error_code || "",
          error_message: event.error_message || "",
          path: location.pathname,
          screen: location.pathname,
          session_id: ensureId(SESSION_KEY),
          anonymous_id: ensureId(ANON_KEY),
          occurred_at: new Date().toISOString(),
          properties: event.properties || {},
        }],
      });
      const url = "/api/v1/analytics/events";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) {}
  };
  const showRecovery = () => {
    // One soft reload before showing the CTA — recovers stuck WebViews without
    // forcing the user to kill Telegram.
    try {
      if (!sessionStorage.getItem("flipo_boot_autoreload")) {
        sessionStorage.setItem("flipo_boot_autoreload", "1");
        post({
          event_name: "boot_autoreload",
          status: "info",
          error_code: "boot_autoreload",
          properties: {
            elapsed_ms: Date.now() - (window.__flipoBoot?.t0 || Date.now()),
            stages: window.__flipoBoot?.stages || {},
          },
        });
        location.reload();
        return;
      }
    } catch (_) {}
    if (document.getElementById("flipo-boot-recovery")) return;
    const el = document.createElement("div");
    el.id = "flipo-boot-recovery";
    el.setAttribute("role", "alert");
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;" +
      "background:var(--background,#0c141c);color:var(--foreground,#f2f5f7);" +
      "font-family:system-ui,-apple-system,sans-serif;";
    el.innerHTML =
      '<p style="margin:0;font-size:15px;line-height:1.45;max-width:280px;opacity:.9">' +
      "Приложение долго загружается. Обычно помогает перезапуск." +
      "</p>" +
      '<button type="button" id="flipo-boot-reload" style="' +
      "appearance:none;border:0;border-radius:12px;padding:12px 20px;font-size:14px;" +
      "font-weight:600;background:#3390ec;color:#fff;cursor:pointer;" +
      '">Перезагрузить</button>';
    document.body.appendChild(el);
    document.getElementById("flipo-boot-reload")?.addEventListener("click", () => {
      post({
        event_name: "boot_reload_clicked",
        status: "info",
        error_code: "boot_reload",
        properties: {
          elapsed_ms: Date.now() - (window.__flipoBoot?.t0 || Date.now()),
          stages: window.__flipoBoot?.stages || {},
        },
      });
      location.reload();
    });
  };
  window.__flipoBoot = {
    t0: Date.now(),
    ready: false,
    hangReported: false,
    stages: { script: 0 },
    mark(stage) {
      if (!this.stages[stage]) this.stages[stage] = Date.now() - this.t0;
      if (stage === "app_ready" || stage === "auth_failed") {
        this.ready = true;
        if (this.timer) clearTimeout(this.timer);
        const overlay = document.getElementById("flipo-boot-recovery");
        if (overlay) overlay.remove();
        try { sessionStorage.removeItem("flipo_boot_autoreload"); } catch (_) {}
      }
    },
    reportHang(reason, extra) {
      if (this.ready || this.hangReported) return;
      this.hangReported = true;
      post({
        event_name: "boot_hang",
        status: "error",
        error_code: "boot_hang",
        error_message: reason || "boot hang",
        properties: Object.assign(
          {
            elapsed_ms: Date.now() - this.t0,
            stages: this.stages,
            has_telegram: !!(window.Telegram && window.Telegram.WebApp),
            has_init_data: !!(
              window.Telegram &&
              window.Telegram.WebApp &&
              window.Telegram.WebApp.initData
            ),
            platform:
              (window.Telegram &&
                window.Telegram.WebApp &&
                window.Telegram.WebApp.platform) ||
              "unknown",
            visibility: document.visibilityState,
          },
          extra || {},
        ),
      });
      if (!(extra && extra.skip_ui)) showRecovery();
    },
  };
  window.__flipoBoot.timer = setTimeout(() => {
    window.__flipoBoot.reportHang("boot still not ready after " + BOOT_HANG_MS + "ms");
  }, BOOT_HANG_MS);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={cn(sans.variable, "bg-background")}>
      <body className="bg-background font-sans antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="tg-theme-bootstrap" strategy="beforeInteractive">
          {tgThemeBootstrap}
        </Script>
        <Script id="flipo-boot-watchdog" strategy="beforeInteractive">
          {bootWatchdog}
        </Script>
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
