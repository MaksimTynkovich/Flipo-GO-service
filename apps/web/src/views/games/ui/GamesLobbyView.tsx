"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();

  return (
    <PageShell title="Игры" description="Crash, Рулетка и PVP — выход в любой момент через нижний таб-бар.">
      <section className="panel space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label">Игровое лобби</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Выбери режим и начни играть. Вложенные экраны закрываются кнопкой «Игры» в шапке.
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15">
            <Layers className="h-5 w-5 text-accent" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {GAME_LOBBY_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => haptics.impactOccurred("light")}
            className="panel flex items-center gap-4 transition-colors active:bg-surface-raised"
          >
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl ${item.accentClassName}`}
            >
              <item.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold">{item.title}</p>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                  {item.badge}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        ))}
      </section>
    </PageShell>
  );
}
