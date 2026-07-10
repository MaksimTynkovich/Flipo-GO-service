"use client";

import { Send } from "lucide-react";
import { miniAppTelegramUrl } from "@/lib/bot";

export function TelegramGateScreen() {
  const appUrl = miniAppTelegramUrl();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-[1.75rem] bg-accent/15 text-accent">
        <Send className="h-9 w-9" strokeWidth={1.75} />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Откройте Flipo в Telegram</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
        Это мини-приложение работает только внутри Telegram. Перейдите в бота, чтобы играть,
        пополнять баланс и управлять подарками.
      </p>

      <a
        href={appUrl}
        rel="noopener noreferrer"
        className="app-control btn-primary mt-8 inline-flex h-11 min-w-[220px] items-center justify-center rounded-xl px-4 text-sm font-semibold"
      >
        Открыть в Telegram
      </a>

      <p className="mt-4 text-xs text-muted/80">Если Telegram уже установлен, ссылка откроет приложение.</p>
    </div>
  );
}
