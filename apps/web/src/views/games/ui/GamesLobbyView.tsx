"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GamesPromoBanner } from "@/components/games/GamesPromoBanner";
import { PageShell } from "@/components/PageShell";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();

  return (
    <PageShell flush>
      <section className="games-lobby space-y-4">
        <GamesPromoBanner />

        <div className="space-y-1 px-0.5">
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground">
            Игры
          </h1>
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Выберите режим — быстрые раунды, живой азарт и мгновенный вход.
          </p>
        </div>

        <div className="games-lobby__grid">
          {GAME_LOBBY_ITEMS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptics.impactOccurred("light")}
              style={{ animationDelay: `${index * 80}ms` }}
              className={cn(
                "games-card app-control stagger-item",
                `games-card--${item.tone}`,
              )}
            >
              <div className="games-card__aura" aria-hidden />
              <div className="games-card__orb games-card__orb--a" aria-hidden />
              <div className="games-card__orb games-card__orb--b" aria-hidden />

              <div className="games-card__top">
                <div className="games-card__icon">
                  <item.icon className="h-6 w-6" strokeWidth={2.1} />
                </div>
                <span className="games-card__badge">{item.badge}</span>
              </div>

              <div className="games-card__body">
                <p className="games-card__title">{item.title}</p>
                <p className="games-card__desc">{item.description}</p>
              </div>

              <div className="games-card__footer">
                <span className="games-card__cta">Играть</span>
                <ArrowRight
                  className="games-card__arrow h-4 w-4"
                  strokeWidth={2.2}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
