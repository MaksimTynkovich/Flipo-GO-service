export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

export type SafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TelegramBackButton = {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: {
      photo_url?: string;
    };
  };
  platform?: string;
  themeParams?: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  disableVerticalSwipes?: () => void;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  BackButton?: TelegramBackButton;
  HapticFeedback?: {
    selectionChanged?: () => void;
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export const TELEGRAM_THEME_DEFAULTS = {
  bgColor: "#17212b",
  textColor: "#f5f5f5",
  hintColor: "#708499",
  buttonColor: "#8774e1",
  linkColor: "#9d8fe8",
  secondaryBgColor: "#232e3c",
} as const;

type Rgb = {
  r: number;
  g: number;
  b: number;
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp ?? null;
}

export function isTelegramMobilePlatform(platform?: string) {
  const value = platform?.toLowerCase() ?? "";
  return value === "android" || value === "ios";
}

/** Open the mini app maximally: expand (legacy) + fullscreen (Bot API 8.0+). */
export function initTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return;
  }

  webApp.ready();
  webApp.expand();
  if (isTelegramMobilePlatform(webApp.platform)) {
    webApp.disableVerticalSwipes?.();
  }

  try {
    if (isTelegramMobilePlatform(webApp.platform) && !webApp.isFullscreen) {
      webApp.requestFullscreen?.();
    }
  } catch {
    // Older Telegram clients only support expand().
  }

  const syncSafeArea = () => applyTelegramSafeAreaToDocument();
  syncSafeArea();
  requestAnimationFrame(syncSafeArea);
  [50, 150, 400, 800].forEach((delay) => window.setTimeout(syncSafeArea, delay));
}

const EMPTY_SAFE_AREA: SafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };

function sumSafeAreaInsets(content: SafeAreaInset, safe: SafeAreaInset): SafeAreaInset {
  return {
    top: content.top + safe.top,
    bottom: content.bottom + safe.bottom,
    left: content.left + safe.left,
    right: content.right + safe.right,
  };
}

function readCssInset(property: string): number {
  if (typeof document === "undefined") {
    return 0;
  }

  const raw = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Floor for TG native header on mobile when API reports zero insets. */
export function telegramMobileHeaderInset(platform?: string): number {
  const value = platform?.toLowerCase() ?? "";

  if (value.includes("android")) {
    return 48;
  }

  if (value.includes("ios")) {
    return 44;
  }

  return 0;
}

export function readTelegramSafeAreaPadding(webApp: TelegramWebApp | null): SafeAreaInset {
  if (!webApp) {
    return EMPTY_SAFE_AREA;
  }

  const safe = webApp.safeAreaInset ?? EMPTY_SAFE_AREA;
  const content = webApp.contentSafeAreaInset ?? EMPTY_SAFE_AREA;

  const inset = sumSafeAreaInsets(content, safe);

  if (inset.top === 0) {
    inset.top =
      readCssInset("--tg-content-safe-area-inset-top") + readCssInset("--tg-safe-area-inset-top");
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

  const minTop = telegramMobileHeaderInset(webApp.platform);
  if (minTop > 0) {
    inset.top = Math.max(inset.top, minTop);
  }

  return inset;
}

export const APP_HEADER_HEIGHT_PX = 56;
export const APP_TABBAR_HEIGHT_PX = 52;
export const APP_CONTENT_GAP_PX = 16;

export function getAppHeaderOffset(topInset: number) {
  return topInset + APP_HEADER_HEIGHT_PX + APP_CONTENT_GAP_PX;
}

export function getAppTabbarOffset(bottomInset: number) {
  return bottomInset + APP_TABBAR_HEIGHT_PX;
}

/** Apply Telegram content/safe area insets (required in fullscreen under native controls). */
export function applyTelegramSafeAreaToDocument() {
  if (typeof document === "undefined") {
    return;
  }

  const webApp = getTelegramWebApp();
  const root = document.documentElement;

  if (!webApp) {
    return;
  }

  const inset = readTelegramSafeAreaPadding(webApp);

  root.style.setProperty("--app-safe-top", `${inset.top}px`);
  root.style.setProperty("--app-safe-bottom", `${inset.bottom}px`);
  root.style.setProperty("--app-safe-left", `${inset.left}px`);
  root.style.setProperty("--app-safe-right", `${inset.right}px`);
  root.style.setProperty("--app-header-offset", `${getAppHeaderOffset(inset.top)}px`);
  root.style.setProperty("--app-tabbar-offset", `${getAppTabbarOffset(inset.bottom)}px`);
}

export function readTelegramTheme() {
  const params = getTelegramWebApp()?.themeParams;

  const bgColor = normalizeBackgroundColor(params?.bg_color);
  const secondaryBgColor = normalizeSecondaryBackgroundColor(params?.secondary_bg_color, bgColor);

  return {
    bgColor,
    textColor: params?.text_color || TELEGRAM_THEME_DEFAULTS.textColor,
    hintColor: params?.hint_color || TELEGRAM_THEME_DEFAULTS.hintColor,
    buttonColor: params?.button_color || TELEGRAM_THEME_DEFAULTS.buttonColor,
    linkColor: params?.link_color || TELEGRAM_THEME_DEFAULTS.linkColor,
    secondaryBgColor,
  };
}

/** Telegram on some devices reports pure black — lift to the app palette. */
function normalizeBackgroundColor(color?: string) {
  const value = color?.trim() || TELEGRAM_THEME_DEFAULTS.bgColor;
  if (getLuminance(value) < 0.1) {
    return TELEGRAM_THEME_DEFAULTS.bgColor;
  }
  return value;
}

function normalizeSecondaryBackgroundColor(color: string | undefined, bgColor: string) {
  const fallback = TELEGRAM_THEME_DEFAULTS.secondaryBgColor;
  let value = color?.trim() || fallback;

  if (getLuminance(value) < 0.1) {
    value = fallback;
  }
  if (getLuminance(value) <= getLuminance(bgColor)) {
    return mixColors(bgColor, TELEGRAM_THEME_DEFAULTS.textColor, 0.06);
  }
  return value;
}

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(input: string) {
  const value = input.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value.charAt(1);
    const g = value.charAt(2);
    const b = value.charAt(3);

    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return null;
}

function hexToRgb(input: string, fallback: string): Rgb {
  const normalized = normalizeHex(input) ?? normalizeHex(fallback) ?? "#000000";
  const hex = normalized.slice(1);

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColors(base: string, overlay: string, ratio: number) {
  const baseRgb = hexToRgb(base, TELEGRAM_THEME_DEFAULTS.bgColor);
  const overlayRgb = hexToRgb(overlay, TELEGRAM_THEME_DEFAULTS.textColor);
  const safeRatio = Math.min(1, Math.max(0, ratio));

  return rgbToHex({
    r: baseRgb.r + (overlayRgb.r - baseRgb.r) * safeRatio,
    g: baseRgb.g + (overlayRgb.g - baseRgb.g) * safeRatio,
    b: baseRgb.b + (overlayRgb.b - baseRgb.b) * safeRatio,
  });
}

function getLuminance(color: string) {
  const { r, g, b } = hexToRgb(color, TELEGRAM_THEME_DEFAULTS.bgColor);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

import { BRAND_ACCENT, BRAND_LINK } from "@/src/shared/config/brand";

export function resolveThemeTokens(theme = readTelegramTheme()) {
  const isDark = getLuminance(theme.bgColor) < 0.45;

  return {
    background: theme.bgColor,
    foreground: theme.textColor,
    muted: theme.hintColor,
    accent: BRAND_ACCENT,
    link: BRAND_LINK,
    surface: theme.secondaryBgColor || mixColors(theme.bgColor, theme.textColor, isDark ? 0.06 : 0.04),
    surfaceRaised: mixColors(
      theme.secondaryBgColor || theme.bgColor,
      theme.textColor,
      isDark ? 0.1 : 0.06,
    ),
    border: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    primary: BRAND_ACCENT,
    success: isDark ? "#4fae4e" : "#31a24c",
    danger: isDark ? "#e56555" : "#e53935",
    isDark,
  };
}

export function applyTelegramThemeToDocument(theme = readTelegramTheme()) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const tokens = resolveThemeTokens(theme);

  root.style.setProperty("--tg-bg-color", theme.bgColor);
  root.style.setProperty("--tg-text-color", theme.textColor);
  root.style.setProperty("--tg-hint-color", theme.hintColor);
  root.style.setProperty("--tg-button-color", theme.buttonColor);
  root.style.setProperty("--background", tokens.background);
  root.style.setProperty("--foreground", tokens.foreground);
  root.style.setProperty("--muted", tokens.muted);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--accent-subtle", `color-mix(in srgb, ${tokens.accent} 14%, transparent)`);
  root.style.setProperty("--link", tokens.link);
  root.style.setProperty("--surface", tokens.surface);
  root.style.setProperty("--surface-raised", tokens.surfaceRaised);
  root.style.setProperty("--border", tokens.border);
  root.style.setProperty("--primary", tokens.primary);
  root.style.setProperty("--success", tokens.success);
  root.style.setProperty("--danger", tokens.danger);
  root.style.colorScheme = tokens.isDark ? "dark" : "light";
}
