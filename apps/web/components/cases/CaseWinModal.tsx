"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TonIcon } from "@/components/icons/TonIcon";
import type { CaseOpenResult } from "@/lib/api";
import { formatTON } from "@/lib/api";
import { giftBuyPriceNanoton, giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

type CaseWinModalProps = {
  result: CaseOpenResult;
  accent?: string;
  onAgain: () => void;
  onInventory: () => void;
};

export function CaseWinModal({
  result,
  accent,
  onAgain,
  onInventory,
}: CaseWinModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const slug =
    result.item.collection_slug || result.loot_entry.collection_slug;
  const image = result.item.image_url || result.loot_entry.image_url;
  const name = result.item.name || result.loot_entry.display_name;
  const value = giftBuyPriceNanoton(result.item);
  const glow = accent || "#3b82f6";

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const main = document.querySelector<HTMLElement>(".app-frame__main");
    const prevMain = main?.style.overflow ?? "";
    if (main) main.style.overflow = "hidden";

    let outer = 0;
    let inner = 0;
    outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setOpen(true));
    });

    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
      document.body.style.overflow = prev;
      if (main) main.style.overflow = prevMain;
    };
  }, []);

  function closeThen(fn: () => void) {
    setOpen(false);
    window.setTimeout(fn, 280);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn("case-win-modal", open && "case-win-modal--open")}
      style={{ ["--case-glow" as string]: glow }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-win-title"
    >
      <button
        type="button"
        className="case-win-modal__backdrop"
        aria-label="Закрыть"
        onClick={() => closeThen(onAgain)}
      />

      <div className="case-win-modal__card">
        <div className="case-win-modal__glow" aria-hidden />

        <p className="case-win-modal__eyebrow">Вы выбили</p>

        <div className="case-win-modal__prize" aria-hidden>
          <span className="case-win-modal__aura" />
          <span className="case-win-modal__ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={giftImageUrl(slug, image)}
            alt=""
            className="case-win-modal__img"
            draggable={false}
          />
        </div>

        <h2 id="case-win-title" className="case-win-modal__title">
          {name}
        </h2>

        {value > 0 ? (
          <p className="case-win-modal__value">
            <TonIcon variant="brand" className="h-3.5 w-3.5" />
            {formatTON(value)} TON
          </p>
        ) : null}

        {!result.backed ? (
          <p className="case-win-modal__note">
            В инвентаре. При выводе бот закупит подарок при необходимости.
          </p>
        ) : (
          <p className="case-win-modal__note">Подарок уже в инвентаре</p>
        )}

        <div className="case-win-modal__actions">
          <button
            type="button"
            className="case-win-modal__btn case-win-modal__btn--ghost app-control"
            onClick={() => closeThen(onAgain)}
          >
            Ещё раз
          </button>
          <button
            type="button"
            className="case-win-modal__btn case-win-modal__btn--primary app-control"
            onClick={() => closeThen(onInventory)}
          >
            В инвентарь
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
