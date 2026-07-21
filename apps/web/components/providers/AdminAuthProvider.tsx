"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ADMIN_AUTH_SESSION_REFRESHED,
  authAdminPanel,
  clearAdminAuthToken,
  getAdminAuthToken,
  getMe,
  setAdminAuthToken,
  type User,
} from "@/lib/api";
import { formatUserError } from "@/lib/user-errors";
import { markBootStage } from "@/lib/boot";
import { AdminButton, AdminField } from "@/components/admin/admin-ui";

type AdminAuthState = {
  user: User | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

function AdminLoginScreen({
  error,
  submitting,
  onSubmit,
}: {
  error: string | null;
  submitting: boolean;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit(password);
  }

  return (
    <div className="admin-login-screen">
      <form
        onSubmit={handleSubmit}
        className="admin-login-card w-full max-w-sm space-y-5"
      >
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--admin-accent)]">
            Flipo
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-fg)]">
            Админ-панель
          </h1>
        </div>

        <AdminField label="Пароль">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-input"
            placeholder="••••••••"
            disabled={submitting}
            autoFocus
          />
        </AdminField>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <AdminButton type="submit" className="w-full" disabled={submitting || !password}>
          {submitting ? "Вход…" : "Войти"}
        </AdminButton>
      </form>
    </div>
  );
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("admin-mode");
    return () => {
      document.documentElement.classList.remove("admin-mode");
    };
  }, []);

  useEffect(() => {
    const onSession = (event: Event) => {
      const next = (event as CustomEvent<{ user: User | null }>).detail?.user ?? null;
      setUser(next);
      if (!next) setError(null);
    };
    window.addEventListener(ADMIN_AUTH_SESSION_REFRESHED, onSession);
    return () => window.removeEventListener(ADMIN_AUTH_SESSION_REFRESHED, onSession);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      markBootStage("auth_started");
      const token = getAdminAuthToken();
      if (!token) {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
          markBootStage("app_ready");
        }
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) {
          setUser(me);
          setError(null);
        }
      } catch {
        clearAdminAuthToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
          markBootStage("app_ready");
        }
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(password: string) {
    setSubmitting(true);
    setError(null);
    try {
      const { token, user: next } = await authAdminPanel(password);
      setAdminAuthToken(token);
      setUser(next);
      window.dispatchEvent(
        new CustomEvent(ADMIN_AUTH_SESSION_REFRESHED, { detail: { user: next } }),
      );
    } catch (e) {
      setError(formatUserError(e, "Не удалось войти"));
      setUser(null);
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    clearAdminAuthToken();
    setUser(null);
    setError(null);
    window.dispatchEvent(
      new CustomEvent(ADMIN_AUTH_SESSION_REFRESHED, { detail: { user: null } }),
    );
  }

  if (loading) {
    return (
      <div className="admin-login-screen text-sm text-[var(--admin-muted)]">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return (
      <AdminLoginScreen error={error} submitting={submitting} onSubmit={login} />
    );
  }

  return (
    <AdminAuthContext.Provider
      value={{ user, loading, ready, error, setUser, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}
