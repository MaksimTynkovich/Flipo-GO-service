"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Coins, Megaphone, Users, type LucideIcon } from "lucide-react";
import { promoChannelMention, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";

type PromoSlide = {
  id: string;
  tone: "channel" | "staking" | "referrals";
  title: string;
  subtitle: string;
  cta: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
};

const AUTO_MS = 4500;

function buildSlides(): PromoSlide[] {
  const slides: PromoSlide[] = [];
  const channelUrl = promoChannelUrl();
  const channelLabel = promoChannelMention();

  if (channelUrl) {
    slides.push({
      id: "channel",
      tone: "channel",
      title: "Наш канал",
      subtitle: channelLabel
        ? `Новости и промо в ${channelLabel}`
        : "Новости, розыгрыши и промокоды",
      cta: "Подписаться",
      icon: Megaphone,
      href: channelUrl,
      external: true,
    });
  }

  slides.push(
    {
      id: "staking",
      tone: "staking",
      title: "Стейкинг подарков",
      subtitle: "До 48% APR — пассивный доход без лишних действий",
      cta: "К стейкингу",
      icon: Coins,
      href: APP_ROUTES.profileStaking,
    },
    {
      id: "referrals",
      tone: "referrals",
      title: "Приглашай друзей",
      subtitle: "Получай долю от их стейкинга каждую неделю",
      cta: "Рефералы",
      icon: Users,
      href: APP_ROUTES.profileReferrals,
    },
  );

  return slides;
}

export function GamesPromoBanner() {
  const slides = useMemo(() => buildSlides(), []);
  const haptics = useTelegramHaptics();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  if (slides.length === 0) return null;

  function go(next: number) {
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }

  function openExternal(url: string) {
    haptics.impactOccurred("light");
    if (!openTelegramLink(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      className="games-promo"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        setPaused(false);
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) < 40) return;
        go(index + (dx < 0 ? 1 : -1));
        haptics.selectionChanged();
      }}
    >
      <div
        className="games-promo__track"
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
      >
        {slides.map((slide) => {
          const Icon = slide.icon;
          const body = (
            <>
              <div className="games-promo__glow" aria-hidden />
              <div className="games-promo__icon">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="games-promo__copy">
                <p className="games-promo__title">{slide.title}</p>
                <p className="games-promo__subtitle">{slide.subtitle}</p>
              </div>
              <span className="games-promo__cta">{slide.cta}</span>
            </>
          );

          if (slide.external && slide.href) {
            return (
              <button
                key={slide.id}
                type="button"
                className={cn("games-promo__slide", `games-promo__slide--${slide.tone}`)}
                onClick={() => openExternal(slide.href!)}
              >
                {body}
              </button>
            );
          }

          return (
            <Link
              key={slide.id}
              href={slide.href ?? APP_ROUTES.games}
              className={cn("games-promo__slide", `games-promo__slide--${slide.tone}`)}
              onClick={() => haptics.impactOccurred("light")}
            >
              {body}
            </Link>
          );
        })}
      </div>

      {slides.length > 1 ? (
        <div className="games-promo__dots" role="tablist" aria-label="Промо">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={cn("games-promo__dot", i === index && "games-promo__dot--active")}
              onClick={() => {
                go(i);
                haptics.selectionChanged();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
