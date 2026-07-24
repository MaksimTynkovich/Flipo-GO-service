"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  getAdminPanelLoginStatus,
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
  awaitingApproval,
  onSubmit,
}: {
  error: string | null;
  submitting: boolean;
  awaitingApproval: boolean;
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

        {awaitingApproval ? (
          <div className="space-y-2 rounded-xl bg-[var(--admin-raised)] px-3 py-3 text-sm leading-relaxed text-[var(--admin-muted)]">
            <p className="font-medium text-[var(--admin-fg)]">Ожидаем подтверждение</p>
            <p>
              В Telegram-боте у админов появилась кнопка «Разрешить вход». После нажатия вы
              попадёте в панель автоматически.
            </p>
          </div>
        ) : (
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
        )}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {!awaitingApproval ? (
          <AdminButton type="submit" className="w-full" disabled={submitting || !password}>
            {submitting ? "Проверяем…" : "Войти"}
          </AdminButton>
        ) : (
          <AdminButton type="button" variant="secondary" className="w-full" disabled>
            Ждём Telegram…
          </AdminButton>
        )}
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
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const pollRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(challengeId: string) {
    stopPolling();
    setAwaitingApproval(true);
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const status = await getAdminPanelLoginStatus(challengeId);
          if (status.status === "pending") return;
          stopPolling();
          setAwaitingApproval(false);
          if (status.status === "approved") {
            setAdminAuthToken(status.token);
            setUser(status.user);
            setError(null);
            window.dispatchEvent(
              new CustomEvent(ADMIN_AUTH_SESSION_REFRESHED, { detail: { user: status.user } }),
            );
            return;
          }
          if (status.status === "denied") {
            setError("Вход отклонён в Telegram");
            return;
          }
          if (status.status === "expired") {
            setError("Время подтверждения истекло — войдите снова");
          }
        } catch (e) {
          stopPolling();
          setAwaitingApproval(false);
          setError(formatUserError(e, "Не удалось проверить статус входа"));
        }
      })();
    }, 2000);
  }

  async function login(password: string) {
    setSubmitting(true);
    setError(null);
    try {
      const pending = await authAdminPanel(password);
      startPolling(pending.challenge_id);
    } catch (e) {
      setError(formatUserError(e, "Не удалось войти"));
      setUser(null);
      setAwaitingApproval(false);
      stopPolling();
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    stopPolling();
    setAwaitingApproval(false);
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
      <AdminLoginScreen
        error={error}
        submitting={submitting}
        awaitingApproval={awaitingApproval}
        onSubmit={login}
      />
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
