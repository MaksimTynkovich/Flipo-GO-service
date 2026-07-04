"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { authDebug, authTelegram, DEBUG_AUTH, getMe, User } from "@/lib/api";

type AuthState = {
  user: User | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  setUser: (u: User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
        }

        const token = localStorage.getItem("flipo_token");
        if (token) {
          try {
            setUser(await getMe());
            return;
          } catch {
            localStorage.removeItem("flipo_token");
          }
        }

        const initData = tg?.initData;
        if (initData) {
          const { token: newToken, user: authUser } = await authTelegram(initData);
          localStorage.setItem("flipo_token", newToken);
          setUser(authUser);
          return;
        }

        if (DEBUG_AUTH) {
          const { token: newToken, user: authUser } = await authDebug();
          localStorage.setItem("flipo_token", newToken);
          setUser(authUser);
          return;
        }

        setError("No Telegram session. Enable NEXT_PUBLIC_DEBUG_AUTH for browser dev.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auth failed");
      } finally {
        setLoading(false);
        setReady(true);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-400">
        Loading...
      </div>
    );
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
