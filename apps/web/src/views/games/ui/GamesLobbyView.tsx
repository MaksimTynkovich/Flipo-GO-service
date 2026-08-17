"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GamesCardArt } from "@/components/games/GamesCardArt";
import { GamesPromoBanner } from "@/components/games/GamesPromoBanner";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { getGameModes, type GameModeKey } from "@/lib/api";
import { APP_ROUTES, GAME_LOBBY_ITEMS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/I18nProvider";

const TONE_TO_MODE: Record<string, GameModeKey> = {
  crash: "crash",
  roulette: "roulette",
};

export function GamesLobbyView() {
  const haptics = useTelegramHaptics();
  const { user } = useAuth();
  const t = useT();
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
          <h2 className="games-lobby__intro-title">{t("games.modes")}</h2>
        </div>

        <div className="games-lobby__grid games-lobby__grid--duo">
          {!modesReady
            ? Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="games-card games-card--duo games-card--skeleton stagger-item"
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
                      "games-card games-card--duo app-control stagger-item",
                      `games-card--${item.tone}`,
                    )}
                  >
                    <GamesCardArt tone={item.tone} />

                    <div className="games-card__content">
                      <p className="games-card__title">
                        {item.title ?? (item.titleKey ? t(item.titleKey) : "")}
                      </p>
                      <p className="games-card__meta">
                        <span className="games-card__meta-dot" />
                        {adminOnly ? t("common.admin") : t(item.badgeKey)}
                      </p>
                      <span className="games-card__cta">
                        <span className="games-card__cta-label">{item.cta ?? t("common.play")}</span>
                        <ChevronRight className="games-card__cta-chevron" strokeWidth={2.75} aria-hidden />
                      </span>
                    </div>
                  </Link>
                );
              })}
        </div>

        <Link
          href={APP_ROUTES.profileReferrals}
          onClick={() => haptics.impactOccurred("light")}
          className="games-lobby__referral app-control"
        >
          <div className="games-lobby__referral-cover" aria-hidden>
            <Image
              src="/games/covers/promo-referrals.webp"
              alt=""
              fill
              sizes="(max-width: 480px) 100vw, 420px"
              draggable={false}
            />
            <div className="games-lobby__referral-fade" />
          </div>
          <div className="games-lobby__referral-copy">
            <p className="games-lobby__referral-title">{t("games.inviteTitle")}</p>
            <p className="games-lobby__referral-desc">{t("games.inviteDesc")}</p>
            <span className="games-lobby__referral-cta">
              {t("games.inviteCta")}
              <ChevronRight className="games-lobby__referral-cta-icon" strokeWidth={2.75} aria-hidden />
            </span>
          </div>
        </Link>
      </section>
    </PageShell>
  );
}
