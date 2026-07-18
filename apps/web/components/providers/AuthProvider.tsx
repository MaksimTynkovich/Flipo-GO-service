"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import {
  AUTH_SESSION_REFRESHED,
  authDebug,
  authTelegram,
  DEBUG_AUTH,
  getMe,
  User,
} from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { markBootStage } from "@/lib/boot";
import { formatUserError } from "@/lib/user-errors";
import { readReferralCodeFromTelegram, storePendingReferral, takePendingReferral } from "@/lib/referral";
import {
  enableTelegramFullscreen,
  getTelegramWebApp,
  hasTelegramInitData,
  initTelegramWebApp,
} from "@/src/shared/lib/twa";
import { AppSplashScreen } from "@/src/widgets/app-shell/ui/AppSplashScreen";

type AuthState = {
  user: User | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  setUser: Dispatch<SetStateAction<User | null>>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onSessionRefreshed = (event: Event) => {
      const user = (event as CustomEvent<{ user: User }>).detail?.user;
      if (user) setUser(user);
    };
    window.addEventListener(AUTH_SESSION_REFRESHED, onSessionRefreshed);
    return () => window.removeEventListener(AUTH_SESSION_REFRESHED, onSessionRefreshed);
  }, []);

  useEffect(() => {
    async function init() {
      markBootStage("auth_started");
      const AUTH_TIMEOUT_MS = 12_000;
      const timeoutId = window.setTimeout(() => {
        trackEvent({
          event_name: "auth_loading_timeout",
          event_category: "auth",
          status: "error",
          error_code: "auth_loading_timeout",
          error_message: `auth still loading after ${AUTH_TIMEOUT_MS}ms`,
          properties: {
            elapsed_ms: AUTH_TIMEOUT_MS,
            has_init_data: hasTelegramInitData(),
            has_token: Boolean(localStorage.getItem("flipo_token")),
          },
        });
      }, AUTH_TIMEOUT_MS);

      try {
        initTelegramWebApp();

        const inTelegram = hasTelegramInitData();
        const allowBrowserSession = DEBUG_AUTH || isAdminRoute;

        const token = localStorage.getItem("flipo_token");
        if (token && (inTelegram || allowBrowserSession)) {
          try {
            setUser(await getMe());
            trackEvent({
              event_name: "auth_restored",
              event_category: "auth",
              status: "success",
            });
            return;
          } catch {
            localStorage.removeItem("flipo_token");
          }
        } else if (token && !inTelegram && !allowBrowserSession) {
          localStorage.removeItem("flipo_token");
        }

        const initData = getTelegramWebApp()?.initData;
        if (initData) {
          const startParam = readReferralCodeFromTelegram();
          if (startParam) {
            storePendingReferral(startParam);
            trackEvent({
              event_name: "referral_detected",
              event_category: "acquisition",
              status: "success",
              start_param: startParam,
              properties: { source: "telegram_start_param" },
            });
          }
          const referralCode = startParam || takePendingReferral() || undefined;
          trackEvent({
            event_name: "auth_started",
            event_category: "auth",
            status: "info",
            start_param: referralCode,
            properties: { source: referralCode ? "referral" : "direct" },
          });
          const { token: newToken, user: authUser } = await authTelegram(initData, referralCode);
          localStorage.setItem("flipo_token", newToken);
          setUser(authUser);
          trackEvent({
            event_name: "auth_succeeded",
            event_category: "auth",
            status: "success",
            start_param: referralCode,
            staking_tier: authUser.staking_tier,
            properties: { source: referralCode ? "referral" : "direct" },
          });
          return;
        }

        if (DEBUG_AUTH) {
          trackEvent({
            event_name: "auth_started",
            event_category: "auth",
            status: "info",
            properties: { source: "debug" },
          });
          const { token: newToken, user: authUser } = await authDebug();
          localStorage.setItem("flipo_token", newToken);
          setUser(authUser);
          trackEvent({
            event_name: "auth_debug_succeeded",
            event_category: "auth",
            status: "success",
            staking_tier: authUser.staking_tier,
            properties: { source: "debug" },
          });
          return;
        }

        setError("Откройте приложение в Telegram.");
        markBootStage("auth_failed");
      } catch (e) {
        trackEvent({
          event_name: "auth_failed",
          event_category: "auth",
          status: "error",
          error_code: "auth_failed",
          error_message: e instanceof Error ? e.message : "auth_failed",
        });
        setError(formatUserError(e, "Не удалось войти"));
        markBootStage("auth_failed");
      } finally {
        window.clearTimeout(timeoutId);
        setLoading(false);
        setReady(true);
        markBootStage("app_ready");
        // After first paint — fullscreen on cold open freezes some Android WebViews.
        window.setTimeout(() => enableTelegramFullscreen(), 100);
      }
    }
    init();
  }, [isAdminRoute]);

  if (loading) {
    return <AppSplashScreen showRecovery />;
  }

  if (!user && error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-danger">{error}</p>
        {DEBUG_AUTH && (
          <p className="text-xs text-zinc-500">
            Check that API has DEBUG_AUTH_ENABLED=true and is reachable at{" "}
            {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}
          </p>
        )}
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, ready, error, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
