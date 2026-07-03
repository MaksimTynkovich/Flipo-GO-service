"use client";

import Link from "next/link";
import { TonConnectButton } from "@tonconnect/ui-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="app-container flex h-[3.75rem] items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-surface">
            F
          </span>
          <div className="min-w-0 leading-none">
            <p className="truncate text-[15px] font-bold text-foreground">Flipo</p>
            <p className="mt-1 truncate text-[11px] text-muted">TON Casino</p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right leading-none">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Баланс</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
              {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
              <span className="ml-1 text-[11px] font-medium text-muted">TON</span>
            </p>
          </div>
          <div className="flex items-center [&_button]:!h-9 [&_button]:!min-h-9 [&_button]:!rounded-xl">
            <TonConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
