"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { GamesCardArt } from "@/components/games/GamesCardArt";
import { GamesPromoBanner } from "@/components/games/GamesPromoBanner";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { getGameModes, getWheelStatus, type GameModeKey } from "@/lib/api";
import { GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

const TONE_TO_MODE: Record<string, GameModeKey> = {
  wheel: "wheel",
  crash: "crash",
  roulette: "roulette",
  pvp: "pvp",
};

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();
  const { user } = useAuth();
  const [wheelReady, setWheelReady] = useState(false);
  const [modes, setModes] = useState<Partial<Record<GameModeKey, { enabled: boolean; available: boolean }>>>({});
  const [modesReady, setModesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGameModes()
      .then((res) => {
        if (cancelled) return;
        setModes(res.modes ?? {});
        setModesReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setModes({});
        setModesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!modesReady) return;
    let cancelled = false;
    const wheelAccess = modes.wheel;
    if (wheelAccess && !wheelAccess.available && !user?.is_admin) {
      setWheelReady(false);
      return;
    }
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
  }, [modesReady, modes.wheel, user?.is_admin]);

  const visibleItems = !modesReady
    ? []
    : GAME_LOBBY_ITEMS.filter((item) => {
        const mode = TONE_TO_MODE[item.tone];
        const access = mode ? modes[mode] : undefined;
        if (!access) return true;
        return access.available || Boolean(user?.is_admin);
      });

  return (
    <PageShell flush>
      <section className="games-lobby space-y-4">
        <GamesPromoBanner />

        <div className="games-lobby__intro">
          <h2 className="games-lobby__intro-title">Режимы</h2>
        </div>

        <div className="games-lobby__grid">
          {!modesReady
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="games-card games-card--skeleton stagger-item"
                  style={{ animationDelay: `${index * 80}ms` }}
                  aria-hidden
                />
              ))
            : visibleItems.map((item, index) => {
                const mode = TONE_TO_MODE[item.tone];
                const access = mode ? modes[mode] : undefined;
                const adminOnly = Boolean(user?.is_admin && access && !access.enabled);
                return (
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

                    {item.tone === "wheel" ? (
                      <span className="games-card__hit" aria-label="HIT">
                        <Flame
                          className="games-card__hit-flame"
                          strokeWidth={0}
                          fill="currentColor"
                          aria-hidden
                        />
                        HIT
                      </span>
                    ) : null}

                    <div className="games-card__content">
                      <div className="games-card__top">
                        <div className="games-card__icon">
                          <item.icon className="h-5 w-5" strokeWidth={2.1} />
                        </div>
                        {item.tone !== "wheel" ? (
                          <span className="games-card__badge">{adminOnly ? "Админ" : item.badge}</span>
                        ) : adminOnly ? (
                          <span className="games-card__badge">Админ</span>
                        ) : null}
                      </div>

                      <div className="games-card__body">
                        <p className="games-card__title">{item.title}</p>
                        {item.tone === "wheel" ? (
                          <p className="games-card__desc">
                            <span className="games-card__desc-gold">Бесплатное вращение</span>
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
                );
              })}
        </div>
      </section>
    </PageShell>
  );
}
