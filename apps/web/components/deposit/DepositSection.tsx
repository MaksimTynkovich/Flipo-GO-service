"use client";

import { useState } from "react";
import { InventoryDepositGuide } from "@/components/inventory/InventoryDepositGuide";
import { TonWalletPanel } from "@/components/deposit/TonWalletPanel";
import { cn } from "@/lib/utils";
import { Gift, Wallet } from "lucide-react";

type Tab = "ton" | "gifts";

export function DepositSection() {
  const [tab, setTab] = useState<Tab>("ton");

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

      {tab === "ton" ? <TonWalletPanel /> : <InventoryDepositGuide variant="deposit" />}
    </div>
  );
}
