"use client";

import { useEffect, useRef, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { InventoryDepositGuide } from "@/components/inventory/InventoryDepositGuide";
import { updateWallet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Gift, Wallet } from "lucide-react";

type Tab = "ton" | "gifts";

function shortenAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function DepositSection() {
  const { user, setUser } = useAuth();
  const wallet = useTonWallet();
  const syncedWallet = useRef<string | null>(null);

  const [tab, setTab] = useState<Tab>("ton");

  const connectedAddress = wallet?.account?.address ?? user?.ton_wallet;

  useEffect(() => {
    const addr = wallet?.account?.address;
    if (!addr || syncedWallet.current === addr || user?.ton_wallet === addr) {
      if (addr) syncedWallet.current = addr;
      return;
    }
    updateWallet(addr)
      .then(() => {
        syncedWallet.current = addr;
        if (user) setUser({ ...user, ton_wallet: addr });
      })
      .catch(() => {});
  }, [wallet?.account?.address, user, setUser]);

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: "ton", label: "TON кошелёк", icon: Wallet },
    { id: "gifts", label: "Подарки", icon: Gift },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Выбери способ зачисления средств</p>

      <div className="segment-control">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("segment-item", tab === id && "segment-item-active")}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "ton" && (
        <div className="panel space-y-4">
          <div>
            <p className="section-label">Telegram Wallet</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Подключи кошелёк через Telegram — пополнение TON появится в следующем обновлении.
            </p>
          </div>

          <div className="flex justify-center [&_button]:!rounded-xl">
            <TonConnectButton />
          </div>

          {connectedAddress && (
            <div className="surface-inset px-3 py-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted">Подключён</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
                {shortenAddress(connectedAddress)}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "gifts" && <InventoryDepositGuide variant="deposit" />}
    </div>
  );
}
