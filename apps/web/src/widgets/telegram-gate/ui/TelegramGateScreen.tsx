"use client";

import { Send } from "lucide-react";
import { miniAppTelegramUrl } from "@/lib/bot";
import { useT } from "@/components/providers/I18nProvider";

export function TelegramGateScreen() {
  const appUrl = miniAppTelegramUrl();
  const t = useT();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-[1.75rem] bg-accent/15 text-accent">
        <Send className="h-9 w-9" strokeWidth={1.75} />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("gate.title")}</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{t("gate.body")}</p>

      <a
        href={appUrl}
        rel="noopener noreferrer"
        className="app-control btn-primary mt-8 inline-flex h-11 min-w-[220px] items-center justify-center rounded-xl px-4 text-sm font-semibold"
      >
        {t("gate.cta")}
      </a>

      <p className="mt-4 text-xs text-muted/80">{t("gate.hint")}</p>
    </div>
  );
}
