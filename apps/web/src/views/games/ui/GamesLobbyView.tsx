"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GamesCardArt } from "@/components/games/GamesCardArt";
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

        <p className="games-lobby__intro-text">
          Ставь TON или подарки — выигрыш сразу на баланс
        </p>

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
              <GamesCardArt tone={item.tone} />

              <div className="games-card__content">
                <div className="games-card__top">
                  <div className="games-card__icon">
                    <item.icon className="h-5 w-5" strokeWidth={2.1} />
                  </div>
                  <span className="games-card__badge">{item.badge}</span>
                </div>

                <div className="games-card__body">
                  <p className="games-card__title">{item.title}</p>
                  <p className="games-card__desc">{item.description}</p>
                </div>

                <div className="games-card__footer">
                  <span className="games-card__cta">
                    Играть
                    <ArrowRight className="games-card__arrow h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
