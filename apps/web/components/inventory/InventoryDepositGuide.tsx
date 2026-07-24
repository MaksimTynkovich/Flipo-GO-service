"use client";

import { ArrowUpRight, Gift } from "lucide-react";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";
import { GIFT_DEPOSIT_ENABLED } from "@/src/shared/config/features";

type Props = {
  variant?: "inventory" | "deposit";
};

export function InventoryDepositGuide({ variant = "inventory" }: Props) {
  if (!GIFT_DEPOSIT_ENABLED) {
    return (
      <section className="panel overflow-hidden p-0 opacity-70">
        <div className="flex items-start gap-3 p-4">
          <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
            <Gift className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="chip">Пополнение</span>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Депозит подарками временно недоступен. Пополнить баланс можно через TON-кошелёк.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const description =
    variant === "deposit" ? (
      <>
        Отправь подарок боту {depositBotMention()} — он появится в инвентаре автоматически.
      </>
    ) : (
      <>
        Отправь подарок боту {depositBotMention()} — он появится здесь автоматически.
      </>
    );

  return (
    <section className="panel overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4">
        <div className="icon-box h-9 w-9 shrink-0 rounded-xl">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="chip chip-accent">Пополнение</span>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      <a
        href={depositBotTelegramUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="app-control btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-none text-sm font-bold"
      >
        Открыть {depositBotMention()}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </section>
  );
}
