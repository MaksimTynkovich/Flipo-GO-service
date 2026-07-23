"use client";

import { useEffect, useState } from "react";
import { InventoryDepositGuide } from "@/components/inventory/InventoryDepositGuide";
import { TonWalletPanel } from "@/components/deposit/TonWalletPanel";
import { trackFlowViewed } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { GIFT_DEPOSIT_ENABLED } from "@/src/shared/config/features";
import { Gift, Wallet } from "lucide-react";

type Tab = "ton" | "gifts";

export function DepositSection() {
  const [tab, setTab] = useState<Tab>("ton");

  useEffect(() => {
    trackFlowViewed("deposit_flow", "wallet");
  }, []);

  useEffect(() => {
    if (!GIFT_DEPOSIT_ENABLED && tab === "gifts") {
      setTab("ton");
    }
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: typeof Wallet; disabled?: boolean }[] = [
    { id: "ton", label: "TON кошелёк", icon: Wallet },
    {
      id: "gifts",
      label: "Подарки",
      icon: Gift,
      disabled: !GIFT_DEPOSIT_ENABLED,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Выбери способ зачисления средств</p>

      <div className="segment-control">
        {tabs.map(({ id, label, icon: Icon, disabled }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setTab(id);
            }}
            className={cn(
              "segment-item",
              tab === id && "segment-item-active",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {!GIFT_DEPOSIT_ENABLED ? (
        <p className="text-xs text-muted">Депозит подарками временно недоступен.</p>
      ) : null}

      <div key={tab} className="segment-panel">
        {tab === "ton" ? <TonWalletPanel /> : <InventoryDepositGuide variant="deposit" />}
      </div>
    </div>
  );
}
