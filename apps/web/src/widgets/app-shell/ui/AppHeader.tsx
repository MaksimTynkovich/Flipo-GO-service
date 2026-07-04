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
    <header className="fixed left-0 right-0 top-0 z-50 bg-background/88 pt-[env(safe-area-inset-top)] backdrop-blur-2xl hairline-bottom">
      <div className="app-container grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 justify-start">
          {isStack ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={`Вернуться: ${screen.backLabel ?? "назад"}`}
              className="inline-flex max-w-full items-center gap-0.5 py-1.5 pr-2 text-accent transition-opacity active:opacity-70"
            >
              <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.25} />
              <span className="truncate text-[15px] font-medium">{screen.backLabel ?? "Назад"}</span>
            </button>
          ) : onProfileTab ? (
            <div aria-label="Профиль" className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-accent/30">
              <UserAvatar user={user} size={36} />
            </div>
          ) : (
            <Link
              href={APP_ROUTES.profile}
              aria-label="Открыть профиль"
              onClick={() => haptics.impactOccurred("light")}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95"
            >
              <UserAvatar user={user} size={36} />
            </Link>
          )}
        </div>

        {isStack && screen.title ? (
          <h1 className="truncate text-center text-[15px] font-semibold text-foreground">{screen.title}</h1>
        ) : (
          <span aria-hidden className="pointer-events-none" />
        )}

        <div className="flex min-w-0 justify-end">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 text-right">
              <p className="truncate text-[15px] font-semibold tabular-nums leading-none text-foreground">
                {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
                <span className="ml-1 text-[11px] font-normal text-muted">TON</span>
              </p>
            </div>

            <Link
              href={APP_ROUTES.deposit}
              aria-label="Пополнить баланс"
              onClick={() => haptics.impactOccurred("medium")}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95",
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
