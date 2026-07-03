"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { formatTON } from "@/lib/api";
import { Plus } from "lucide-react";

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="app-container flex h-14 items-center justify-between gap-3">
        <Link href="/profile" className="flex min-w-0 items-center gap-2.5">
          <UserAvatar user={user} size={34} />
          <p className="truncate text-[15px] font-bold tabular-nums leading-none text-foreground">
            {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
            <span className="ml-1 text-[11px] font-medium text-muted">TON</span>
          </p>
        </Link>

        <Link
          href="/deposit"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-surface transition-opacity active:opacity-80"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Пополнить
        </Link>
      </div>
    </header>
  );
}
