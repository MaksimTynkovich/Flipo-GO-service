"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GamesCardArt } from "@/components/games/GamesCardArt";
import { GamesPromoBanner } from "@/components/games/GamesPromoBanner";
import { PageShell } from "@/components/PageShell";
import { getWheelStatus } from "@/lib/api";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();
  const [wheelReady, setWheelReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWheelStatus()
      .then((status) => {
        if (cancelled) return;
        setWheelReady(status.can_spin || status.daily_available || status.bonus_spins > 0);
      })
      .catch(() => {
        if (!cancelled) setWheelReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell flush>
      <section className="games-lobby space-y-4">
        <GamesPromoBanner />

        <div className="games-lobby__intro">
          <h2 className="games-lobby__intro-title">Режимы</h2>
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
                  item.tone === "wheel" && wheelReady && "games-card--wheel-ready",
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
                    {item.tone === "wheel" ? (
                      <p className="games-card__desc">
                        <span className="games-card__desc-gold">Бесплатный прокрут</span>
                        {" каждый день — TON сразу на баланс."}
                      </p>
                    ) : (
                      <p className="games-card__desc">{item.description}</p>
                    )}
                  </div>

                  <div className="games-card__footer">
                    <span className="games-card__cta">
                      {item.cta ?? "Играть"}
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
