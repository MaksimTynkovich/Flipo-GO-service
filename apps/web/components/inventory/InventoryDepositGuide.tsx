"use client";

import { ArrowUpRight, Gift } from "lucide-react";
import { useT } from "@/components/providers/I18nProvider";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";
import { GIFT_DEPOSIT_ENABLED } from "@/src/shared/config/features";

type Props = {
  variant?: "inventory" | "deposit";
};

export function InventoryDepositGuide({ variant = "inventory" }: Props) {
  const t = useT();
  const bot = depositBotMention();

  if (!GIFT_DEPOSIT_ENABLED) {
    return (
      <section className="panel overflow-hidden p-0 opacity-70">
        <div className="flex items-start gap-3.5 p-4.5 px-4 py-4">
          <div className="icon-box h-11 w-11 shrink-0 rounded-2xl">
            <Gift className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="chip">{t("inventory.chipDeposit")}</span>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              {t("inventory.giftsDisabled")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const description =
    variant === "deposit"
      ? t("inventory.sendAuto", { bot })
      : t("inventory.sendHere", { bot });

  return (
    <section className="panel overflow-hidden p-0">
      <div className="flex items-start gap-3.5 px-4 py-4">
        <div className="icon-box h-11 w-11 shrink-0 rounded-2xl">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="chip chip-accent">{t("inventory.chipDeposit")}</span>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      <a
        href={depositBotTelegramUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="app-control btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-none text-sm font-bold"
      >
        {t("inventory.openBotNamed", { bot })}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </section>
  );
}
