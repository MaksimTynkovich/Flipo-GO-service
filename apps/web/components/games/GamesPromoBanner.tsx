"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Send } from "lucide-react";
import { promoChannelMention, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { cn } from "@/lib/utils";
import { useT } from "@/components/providers/I18nProvider";

type PromoSlide = {
  id: string;
  tone: "channel" | "staking" | "referrals";
  title: string;
  subtitle: string;
  cta: string;
  href?: string;
  external?: boolean;
  coverSrc: string;
};

const AUTO_MS = 4000;

function buildSlides(t: ReturnType<typeof useT>): PromoSlide[] {
  const slides: PromoSlide[] = [];
  const channelUrl = promoChannelUrl();
  const channelLabel = promoChannelMention();

  if (channelUrl) {
    slides.push({
      id: "channel",
      tone: "channel",
      title: t("games.channelTitle"),
      subtitle: channelLabel
        ? t("games.channelSubtitleNamed", { channel: channelLabel })
        : t("games.channelSubtitle"),
      cta: t("games.channelCta"),
      href: channelUrl,
      external: true,
      coverSrc: "/games/covers/promo-channel.webp",
    });
  }

  slides.push(
    {
      id: "staking",
      tone: "staking",
      title: t("games.stakingTitle"),
      subtitle: t("games.stakingSubtitle"),
      cta: t("games.stakingCta"),
      href: APP_ROUTES.profileStaking,
      coverSrc: "/games/covers/promo-staking.webp",
    },
    {
      id: "referrals",
      tone: "referrals",
      title: t("games.inviteTitle"),
      subtitle: t("games.inviteDesc"),
      cta: t("games.inviteCta"),
      href: APP_ROUTES.profileReferrals,
      coverSrc: "/games/covers/promo-referrals.webp",
    },
  );

  return slides;
}

export function GamesPromoBanner() {
  const t = useT();
  const slides = useMemo(() => buildSlides(t), [t]);
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
        {slides.map((slide, slideIndex) => {
          const body = (
            <>
              <div className="games-promo__cover" aria-hidden>
                <Image
                  src={slide.coverSrc}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 100vw, 420px"
                  draggable={false}
                  priority={slideIndex === 0}
                />
                <div className="games-promo__cover-fade" />
              </div>
              <div className="games-promo__copy">
                <p className="games-promo__title">{slide.title}</p>
                <p className="games-promo__subtitle">{slide.subtitle}</p>
                <span className="games-promo__cta">
                  {slide.tone === "channel" ? (
                    <Send className="games-promo__cta-icon" strokeWidth={2.4} aria-hidden />
                  ) : null}
                  {slide.cta}
                  {slide.tone !== "channel" ? (
                    <ChevronRight className="games-promo__cta-icon" strokeWidth={2.75} aria-hidden />
                  ) : null}
                </span>
              </div>
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
        <div className="games-promo__dots" role="tablist" aria-label={t("games.promoAria")}>
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
