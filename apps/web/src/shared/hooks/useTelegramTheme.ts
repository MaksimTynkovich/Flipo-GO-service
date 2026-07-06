"use client";

import { useEffect, useState } from "react";
import {
  applyTelegramThemeToDocument,
  getTelegramWebApp,
  readTelegramTheme,
  resolveThemeTokens,
  TELEGRAM_THEME_DEFAULTS,
} from "@/src/shared/lib/twa";

type TelegramTheme = {
  bgColor: string;
  textColor: string;
  hintColor: string;
  buttonColor: string;
  linkColor: string;
  secondaryBgColor: string;
};

export function useTelegramTheme(): TelegramTheme {
  const [theme, setTheme] = useState<TelegramTheme>(TELEGRAM_THEME_DEFAULTS);

  useEffect(() => {
    const webApp = getTelegramWebApp();

    const syncTheme = () => {
      const nextTheme = readTelegramTheme();
      const tokens = resolveThemeTokens(nextTheme);

      setTheme(nextTheme);
      applyTelegramThemeToDocument(nextTheme);
      webApp?.setBackgroundColor?.(tokens.background);
      webApp?.setHeaderColor?.(tokens.surface);
    };

    syncTheme();
    webApp?.onEvent?.("themeChanged", syncTheme);

    return () => {
      webApp?.offEvent?.("themeChanged", syncTheme);
    };
  }, []);

  return theme;
}
