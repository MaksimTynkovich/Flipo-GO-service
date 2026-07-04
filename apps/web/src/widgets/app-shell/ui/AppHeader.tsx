"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { cn } from "@/lib/utils";
import { APP_ROUTES, getActiveMainTab, getScreenContext } from "@/src/shared/config/navigation";
import { useAppBackNavigation } from "@/src/shared/hooks/useAppBackNavigation";
import { useTelegramBackButton } from "@/src/shared/hooks/useTelegramBackButton";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function AppHeader() {
  const pathname = usePathname();
  const screen = getScreenContext(pathname);
  const activeTab = getActiveMainTab(pathname);
  const goBack = useAppBackNavigation(screen);
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();
  const isStack = screen.level === "stack";
  const onProfileTab = activeTab === "profile" && !isStack;

  useTelegramBackButton(screen, goBack);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/82 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="app-container grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 justify-start">
          {isStack ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={`Вернуться: ${screen.backLabel ?? "назад"}`}
              className="inline-flex max-w-full items-center gap-0.5 rounded-2xl py-2 pr-3 text-muted transition-colors active:text-foreground"
            >
              <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span className="truncate text-sm font-medium">{screen.backLabel ?? "Назад"}</span>
            </button>
          ) : onProfileTab ? (
            <div
              aria-label="Профиль"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-raised ring-2 ring-accent/40"
            >
              <UserAvatar user={user} size={32} />
            </div>
          ) : (
            <Link
              href={APP_ROUTES.profile}
              aria-label="Открыть профиль"
              onClick={() => haptics.impactOccurred("light")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-soft transition-transform active:scale-[0.97]"
            >
              <UserAvatar user={user} size={32} />
            </Link>
          )}
        </div>

        {isStack && screen.title ? (
          <h1 className="truncate text-center text-sm font-semibold text-foreground">{screen.title}</h1>
        ) : (
          <span aria-hidden className="pointer-events-none" />
        )}

        <div className="flex min-w-0 justify-end">
          <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-soft">
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Баланс</p>
              <p className="truncate text-[15px] font-bold tabular-nums text-foreground">
                {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
                <span className="ml-1 text-[11px] font-medium text-muted">TON</span>
              </p>
            </div>

            <Link
              href={APP_ROUTES.deposit}
              aria-label="Пополнить баланс"
              onClick={() => haptics.impactOccurred("medium")}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-surface transition-transform active:scale-[0.97]",
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
