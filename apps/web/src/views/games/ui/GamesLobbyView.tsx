"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();

  return (
    <PageShell title="Игры" description="Выбери режим и начни играть">
      <section className="space-y-2">
        {GAME_LOBBY_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => haptics.impactOccurred("light")}
            className="panel flex items-center gap-3.5 transition-opacity active:opacity-80"
          >
            <div className="icon-box h-12 w-12">
              <item.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold">{item.title}</p>
                <span className="chip">{item.badge}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted/60" strokeWidth={2} />
          </Link>
        ))}
      </section>
    </PageShell>
  );
}
