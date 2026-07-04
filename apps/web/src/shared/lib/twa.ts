export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  button_color?: string;
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
  themeParams?: TelegramThemeParams;
  ready: () => void;
  expand: () => void;
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
  bgColor: "#0f1318",
  textColor: "#f4f4f5",
  hintColor: "#8b93a1",
  buttonColor: "#f1c40f",
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

export function readTelegramTheme() {
  const params = getTelegramWebApp()?.themeParams;

  return {
    bgColor: params?.bg_color || TELEGRAM_THEME_DEFAULTS.bgColor,
    textColor: params?.text_color || TELEGRAM_THEME_DEFAULTS.textColor,
    hintColor: params?.hint_color || TELEGRAM_THEME_DEFAULTS.hintColor,
    buttonColor: params?.button_color || TELEGRAM_THEME_DEFAULTS.buttonColor,
  };
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

function deriveThemeTokens(theme = readTelegramTheme()) {
  const isDark = getLuminance(theme.bgColor) < 0.45;

  return {
    background: theme.bgColor,
    foreground: theme.textColor,
    muted: theme.hintColor,
    accent: theme.buttonColor,
    surface: mixColors(theme.bgColor, theme.textColor, isDark ? 0.08 : 0.04),
    surfaceRaised: mixColors(theme.bgColor, theme.textColor, isDark ? 0.14 : 0.08),
    border: mixColors(theme.bgColor, theme.textColor, isDark ? 0.18 : 0.12),
    primary: mixColors(theme.buttonColor, theme.textColor, isDark ? 0.12 : 0.2),
    isDark,
  };
}

export function applyTelegramThemeToDocument(theme = readTelegramTheme()) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const tokens = deriveThemeTokens(theme);

  root.style.setProperty("--tg-bg-color", theme.bgColor);
  root.style.setProperty("--tg-text-color", theme.textColor);
  root.style.setProperty("--tg-hint-color", theme.hintColor);
  root.style.setProperty("--tg-button-color", theme.buttonColor);
  root.style.setProperty("--background", tokens.background);
  root.style.setProperty("--foreground", tokens.foreground);
  root.style.setProperty("--muted", tokens.muted);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--surface", tokens.surface);
  root.style.setProperty("--surface-raised", tokens.surfaceRaised);
  root.style.setProperty("--border", tokens.border);
  root.style.setProperty("--primary", tokens.primary);
  root.style.colorScheme = tokens.isDark ? "dark" : "light";
}
