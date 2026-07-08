"use client";

import { ArrowUpRight, Gift } from "lucide-react";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";

type Props = {
  variant?: "inventory" | "deposit";
};

export function InventoryDepositGuide({ variant = "inventory" }: Props) {
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
        className="flex h-12 w-full items-center justify-center gap-2 bg-accent text-sm font-bold text-white transition-opacity active:opacity-90"
      >
        Открыть {depositBotMention()}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </section>
  );
}
