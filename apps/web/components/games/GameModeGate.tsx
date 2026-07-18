"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { getGameModes, type GameModeKey } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";

type GateState = "loading" | "ok" | "blocked";

export function GameModeGate({
  mode,
  children,
}: {
  mode: GameModeKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    getGameModes()
      .then((res) => {
        if (cancelled) return;
        const access = res.modes?.[mode];
        if (!access || access.available || user?.is_admin) {
          setState("ok");
          return;
        }
        setState("blocked");
      })
      .catch(() => {
        if (!cancelled) setState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, user?.is_admin]);

  if (state === "loading") {
    return (
      <PageShell>
        <div className="space-y-3 pt-6">
          <div className="h-6 w-40 animate-pulse rounded bg-surface-raised" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-raised" />
        </div>
      </PageShell>
    );
  }

  if (state === "blocked") {
    return (
      <PageShell>
        <div className="space-y-3 pt-6">
          <h1 className="text-lg font-semibold">Режим временно недоступен</h1>
          <p className="text-sm text-muted">
            Этот режим сейчас выключен. Загляните позже или выберите другую игру.
          </p>
          <Link href={APP_ROUTES.games} className="inline-flex text-sm font-medium text-accent">
            К списку режимов
          </Link>
        </div>
      </PageShell>
    );
  }

  return <>{children}</>;
}
