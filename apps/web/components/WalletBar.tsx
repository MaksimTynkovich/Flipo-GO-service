"use client";

import { TonConnectButton } from "@tonconnect/ui-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatTON } from "@/lib/api";
import { Card } from "@/components/ui/button";

export function WalletBar() {
  const { user, loading } = useAuth();
  return (
    <Card className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs text-zinc-400">Betting Balance</p>
        <p className="text-lg font-semibold">
          {loading ? "..." : user ? `${formatTON(user.betting_balance)} TON` : "—"}
        </p>
        {user && (
          <p className="text-xs text-zinc-500">
            Tier: {user.staking_tier} · @{user.username || user.first_name}
          </p>
        )}
      </div>
      <TonConnectButton />
    </Card>
  );
}
