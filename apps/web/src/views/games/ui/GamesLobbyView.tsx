"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();

  return (
    <PageShell flush>
      <section className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground">
            Игры
          </h1>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Выберите режим — всё заточено под быстрые раунды на телефоне.
          </p>
        </div>

        <div className="space-y-2.5">
          {GAME_LOBBY_ITEMS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptics.impactOccurred("light")}
              style={{ animationDelay: `${index * 70}ms` }}
              className="app-control interactive-card panel stagger-item group flex items-center gap-3.5"
            >
              <div className="icon-box h-12 w-12 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3 group-active:scale-95">
                <item.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold tracking-tight">{item.title}</p>
                  <span className="chip chip-accent chip-live">{item.badge}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
              </div>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted/50 transition-all duration-200 ease-out group-hover:translate-x-1 group-hover:text-accent"
                strokeWidth={2}
              />
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
