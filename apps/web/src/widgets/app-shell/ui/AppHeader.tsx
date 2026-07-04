"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { cn } from "@/lib/utils";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function AppHeader() {
  const { user, loading } = useAuth();
  const haptics = useTelegramHaptics();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 bg-background/88 pt-[env(safe-area-inset-top)] backdrop-blur-2xl hairline-bottom">
      <div className="app-container flex h-14 items-center justify-between gap-3">
        <Link
          href={APP_ROUTES.profile}
          aria-label="Открыть профиль"
          onClick={() => haptics.impactOccurred("light")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
        >
          <UserAvatar user={user} size={36} />
        </Link>

        <div className="flex min-w-0 items-center gap-1.5">
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
    </header>
  );
}
