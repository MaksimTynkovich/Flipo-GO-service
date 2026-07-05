"use client";

import { ArrowUpRight, Gift, ScanLine, Wallet } from "lucide-react";
import { depositBotMention, depositBotTelegramUrl } from "@/lib/bot";

const STEPS = [
  {
    icon: Gift,
    title: "Отправь подарок боту",
    text: `Передай collectible gift нашему боту ${depositBotMention()} в Telegram.`,
  },
  {
    icon: ScanLine,
    title: "Бот проверяет перевод",
    text: "Аккаунт бота отслеживает входящие подарки и считывает их атрибуты.",
  },
  {
    icon: Wallet,
    title: "Оценка и зачисление",
    text: "Подарок оценивается по рыночной стоимости и автоматически появляется в инвентаре.",
  },
] as const;

export function InventoryDepositGuide() {
  return (
    <section className="panel space-y-4">
      <div>
        <p className="section-label">Пополнение подарками</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Чтобы добавить подарок в инвентарь, сначала зайди в приложение, затем передай collectible gift
          нашему боту — он оценит gift и зачислит его на твой аккаунт.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-accent">
              <step.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium">
                {index + 1}. {step.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="surface-inset space-y-2 px-3 py-3 text-xs leading-relaxed text-muted">
        <p>
          Оценка строится по минимальной рыночной цене атрибутов подарка (model, backdrop, symbol).
          Для стейкинга используется полная оценка, для выкупа ботом — с учётом комиссии платформы.
        </p>
      </div>

      <a
        href={depositBotTelegramUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-semibold text-white transition-opacity active:opacity-80"
      >
        Открыть {depositBotMention()}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </section>
  );
}
