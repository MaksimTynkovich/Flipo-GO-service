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
  onSell: () => Promise<void>;
};

export function CaseWinModal({
  result,
  accent,
  onAgain,
  onSell,
}: CaseWinModalProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selling, setSelling] = useState(false);

  const slug =
    result.item.collection_slug || result.loot_entry.collection_slug;
  const image = result.item.image_url || result.loot_entry.image_url;
  const name = result.item.name || result.loot_entry.display_name;
  const value = giftBuyPriceNanoton(result.item);
  const glow = accent || "#3390ec";

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
    if (selling) return;
    setOpen(false);
    window.setTimeout(fn, 280);
  }

  async function handleSell() {
    if (selling) return;
    setSelling(true);
    try {
      await onSell();
      setOpen(false);
      window.setTimeout(onAgain, 280);
    } catch {
      setSelling(false);
    }
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
        disabled={selling}
        onClick={() => closeThen(onAgain)}
      />

      <div className="case-win-modal__body">
        <p className="case-win-modal__eyebrow">Поздравляем! Вы выиграли</p>

        <div className="case-win-modal__prize" aria-hidden>
          <span className="case-win-modal__aura" />
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
            <TonIcon variant="brand" className="h-4 w-4" />
            {formatTON(value)} TON
          </p>
        ) : null}

        <div className="case-win-modal__actions">
          <button
            type="button"
            className="case-win-modal__btn case-win-modal__btn--primary app-control"
            disabled={selling}
            onClick={() => void handleSell()}
          >
            {selling ? "Продажа…" : "Продать"}
          </button>
          <button
            type="button"
            className="case-win-modal__btn case-win-modal__btn--ghost app-control"
            disabled={selling}
            onClick={() => closeThen(onAgain)}
          >
            Ещё раз
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
