"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { getDailyQuestPromo, resolveAsset, type DailyQuestPromoSlide } from "@/lib/api";
import { cn } from "@/lib/utils";

const AUTO_MS = 4500;

/** Only used when the promo API fails or returns empty — never as the initial paint. */
const FALLBACK_SLIDES: DailyQuestPromoSlide[] = [
  {
    id: "duo",
    tone: "duo",
    eyebrow: "Супер-акция",
    title: "1+1 на кейсы",
    subtitle: "Открой кейс — второй бесплатно",
    cta: "К заданиям",
    cta_color: "#7c5cff",
    cover_url: "/cases/covers/quest-promo-2x.webp",
    active: true,
  },
  {
    id: "open",
    tone: "open",
    eyebrow: "Задание дня",
    title: "Открой кейс",
    subtitle: "Выполни цель и забери награду",
    cta: "Смотреть",
    cta_color: "#0f9f7a",
    cover_url: "/cases/covers/quest-promo-open.webp",
    active: true,
  },
];

function toneClass(tone: string): "duo" | "open" {
  return tone === "duo" ? "duo" : "open";
}

export function normalizeQuestPromoCtaColor(value?: string | null): string | undefined {
  const v = value?.trim() ?? "";
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return undefined;
}

function titleSizeClass(size?: string): string {
  switch ((size || "md").toLowerCase()) {
    case "sm":
      return "cases-quest-promo__title--sm";
    case "lg":
      return "cases-quest-promo__title--lg";
    default:
      return "cases-quest-promo__title--md";
  }
}

/** Renders text with **accent** spans and \\n line breaks. */
export function renderQuestPromoText(text: string): ReactNode {
  const normalized = text.replace(/\\n/g, "\n");
  const chunks = normalized.split(/(\*\*[^*\n]+\*\*)/g);
  const nodes: ReactNode[] = [];
  chunks.forEach((chunk, chunkIdx) => {
    if (!chunk) return;
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      nodes.push(
        <span key={`a-${chunkIdx}`} className="cases-quest-promo__accent">
          {chunk.slice(2, -2)}
        </span>,
      );
      return;
    }
    const lines = chunk.split("\n");
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) nodes.push(<br key={`br-${chunkIdx}-${lineIdx}`} />);
      if (line) nodes.push(<span key={`t-${chunkIdx}-${lineIdx}`}>{line}</span>);
    });
  });
  return nodes.length > 0 ? nodes : null;
}

function slideTextStyle(slide: DailyQuestPromoSlide): CSSProperties | undefined {
  const vars: Record<string, string> = {};
  const cta = normalizeQuestPromoCtaColor(slide.cta_color);
  const eyebrow = normalizeQuestPromoCtaColor(slide.eyebrow_color);
  const title = normalizeQuestPromoCtaColor(slide.title_color);
  const subtitle = normalizeQuestPromoCtaColor(slide.subtitle_color);
  const accent = normalizeQuestPromoCtaColor(slide.accent_color);
  if (cta) vars["--quest-cta-color"] = cta;
  if (eyebrow) vars["--quest-eyebrow-color"] = eyebrow;
  if (title) vars["--quest-title-color"] = title;
  if (subtitle) vars["--quest-subtitle-color"] = subtitle;
  if (accent) vars["--quest-accent-color"] = accent;
  return Object.keys(vars).length > 0 ? (vars as CSSProperties) : undefined;
}

/** Static slide card — used by live banner and admin preview. */
export function CasesQuestPromoSlideCard({
  slide,
  interactive = true,
  className,
  onNavigate,
}: {
  slide: DailyQuestPromoSlide;
  interactive?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const cover = resolveAsset(slide.cover_url?.trim()) || undefined;
  const slideClass = cn(
    "cases-quest-promo__slide",
    `cases-quest-promo__slide--${toneClass(slide.tone)}`,
    !interactive && "pointer-events-none",
    className,
  );
  const slideStyle = slideTextStyle(slide);

  const body = (
    <>
      {cover ? (
        <div className="cases-quest-promo__cover" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" draggable={false} />
          <div className="cases-quest-promo__cover-fade" />
        </div>
      ) : null}
      <div className="cases-quest-promo__copy">
        {slide.eyebrow ? (
          <p
            className={cn(
              "cases-quest-promo__eyebrow",
              slide.eyebrow_bold && "cases-quest-promo__text--bold",
            )}
          >
            {renderQuestPromoText(slide.eyebrow)}
          </p>
        ) : null}
        {slide.title ? (
          <p
            className={cn(
              "cases-quest-promo__title",
              titleSizeClass(slide.title_size),
              slide.title_bold && "cases-quest-promo__text--bold",
            )}
          >
            {renderQuestPromoText(slide.title)}
          </p>
        ) : null}
        {slide.subtitle ? (
          <p
            className={cn(
              "cases-quest-promo__subtitle",
              slide.subtitle_bold && "cases-quest-promo__text--bold",
            )}
          >
            {renderQuestPromoText(slide.subtitle)}
          </p>
        ) : null}
        <span
          className={cn(
            "cases-quest-promo__cta",
            slide.cta_bold && "cases-quest-promo__cta--bold",
          )}
        >
          {slide.cta || "К заданиям"}
          <ChevronRight
            className="cases-quest-promo__cta-icon"
            strokeWidth={2.75}
            aria-hidden
          />
        </span>
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div className={slideClass} style={slideStyle} aria-hidden>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={APP_ROUTES.quests}
      className={slideClass}
      style={slideStyle}
      onClick={() => onNavigate?.()}
    >
      {body}
    </Link>
  );
}

/** Admin / design preview of one slide at mobile banner size. */
export function CasesQuestBannerPreview({
  slide,
  className,
}: {
  slide: DailyQuestPromoSlide;
  className?: string;
}) {
  return (
    <div className={cn("cases-quest-promo cases-quest-promo--preview", className)}>
      <div className="cases-quest-promo__track" style={{ transform: "translate3d(0, 0, 0)" }}>
        <CasesQuestPromoSlideCard slide={slide} interactive={false} />
      </div>
    </div>
  );
}

export function CasesQuestBanner() {
  const haptics = useTelegramHaptics();
  const [slides, setSlides] = useState<DailyQuestPromoSlide[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await getDailyQuestPromo();
        if (cancelled) return;
        setSlides(items.length > 0 ? items : FALLBACK_SLIDES);
        setIndex(0);
      } catch {
        if (cancelled) return;
        setSlides(FALLBACK_SLIDES);
        setIndex(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slides || slides.length < 2 || paused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [paused, slides]);

  if (!slides || slides.length === 0) return null;

  const visibleSlides = slides;

  function go(next: number) {
    setIndex(((next % visibleSlides.length) + visibleSlides.length) % visibleSlides.length);
  }

  return (
    <div
      className="cases-quest-promo"
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
        className="cases-quest-promo__track"
        style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
      >
        {visibleSlides.map((slide) => (
          <CasesQuestPromoSlideCard
            key={slide.id}
            slide={slide}
            interactive
            onNavigate={() => haptics.impactOccurred("light")}
          />
        ))}
      </div>

      {visibleSlides.length > 1 ? (
        <div className="cases-quest-promo__dots" role="tablist" aria-label="Акции квестов">
          {visibleSlides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={cn(
                "cases-quest-promo__dot",
                i === index && "cases-quest-promo__dot--active",
              )}
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
