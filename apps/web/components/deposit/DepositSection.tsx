"use client";

import { useEffect, useState } from "react";
import { TonWalletPanel } from "@/components/deposit/TonWalletPanel";
import { AltDepositPanel } from "@/components/deposit/AltDepositPanel";
import { trackFlowViewed } from "@/lib/analytics";
import { getPaymentFeatures, type PaymentFeatures } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/I18nProvider";
import { Bot, Star, Wallet } from "lucide-react";

type Tab = "ton" | "cryptobot" | "stars";

export function DepositSection() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("ton");
  const [features, setFeatures] = useState<PaymentFeatures | null>(null);

  useEffect(() => {
    trackFlowViewed("deposit_flow", "wallet");
  }, []);

  useEffect(() => {
    getPaymentFeatures()
      .then(setFeatures)
      .catch(() =>
        setFeatures({
          cryptobot_enabled: false,
          stars_enabled: false,
          min_deposit_nanoton: 100_000_000,
          stars_usd_rate: 0.013,
        }),
      );
  }, []);

  useEffect(() => {
    if (features && tab === "cryptobot" && !features.cryptobot_enabled) setTab("ton");
    if (features && tab === "stars" && !features.stars_enabled) setTab("ton");
  }, [tab, features]);

  const tabs: { id: Tab; label: string; icon: typeof Wallet; disabled?: boolean }[] = [
    { id: "ton", label: "TON", icon: Wallet },
    {
      id: "cryptobot",
      label: "Crypto Bot",
      icon: Bot,
      disabled: features ? !features.cryptobot_enabled : false,
    },
    {
      id: "stars",
      label: "Stars",
      icon: Star,
      disabled: features ? !features.stars_enabled : false,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{t("deposit.pickMethod")}</p>

      <div className="segment-control overflow-x-auto">
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
              "segment-item shrink-0",
              tab === id && "segment-item-active",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div key={tab} className="segment-panel">
        {tab === "ton" ? <TonWalletPanel /> : null}
        {tab === "cryptobot" ? <AltDepositPanel provider="cryptobot" /> : null}
        {tab === "stars" ? <AltDepositPanel provider="stars" /> : null}
      </div>
    </div>
  );
}
