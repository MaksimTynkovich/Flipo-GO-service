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
  description: "Flipi, Games, staking and more on TON",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
    }
    try {
      if (isMobilePlatform(webApp.platform) && !webApp.isFullscreen) {
        webApp.requestFullscreen?.();
      }
    } catch (_) {}
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={cn(sans.variable, "bg-background")}>
      <body className="bg-background font-sans antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="tg-theme-bootstrap" strategy="beforeInteractive">
          {tgThemeBootstrap}
        </Script>
        <Providers>
          <AppLayout>{children}</AppLayout>
        </Providers>
      </body>
    </html>
  );
}
