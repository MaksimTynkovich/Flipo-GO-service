"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CaseTonPrizeArt } from "@/components/cases/CaseTonPrizeArt";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatTON, resolveAsset, type DailyQuestReward } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { useT } from "@/components/providers/I18nProvider";
import { cn } from "@/lib/utils";

type Props = {
  reward: DailyQuestReward;
  isBonus?: boolean;
  /** Admin-uploaded card art — preferred over reward preview when set. */
  cardImageUrl?: string;
  onClose: () => void;
};

function rewardKind(reward: DailyQuestReward): "gift" | "case" | "ton" {
  if (reward.type === "gift") return "gift";
  if (reward.type === "free_case_open") return "case";
  return "ton";
}

export function QuestClaimModal({ reward, isBonus = false, cardImageUrl, onClose }: Props) {
  const t = useT();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const kind = rewardKind(reward);
  const customCover = resolveAsset(cardImageUrl?.trim());
  const caseCover = resolveAsset(reward.case_image_url?.trim());
  const caseTitle = reward.case_title?.trim() || t("quests.freeCase");
  const caseHref =
    reward.case_slug?.trim() || reward.case_id?.trim()
      ? `${APP_ROUTES.cases}/${encodeURIComponent(reward.case_slug?.trim() || reward.case_id!.trim())}`
      : APP_ROUTES.cases;
  const giftSlug = reward.collection_slug?.trim() || "";
  const giftImage = reward.gift_image_url?.trim() || "";
  const giftName = reward.gift_name?.trim() || reward.model_name?.trim() || t("quests.giftFallback");
  const tonValue = reward.nanoton && reward.nanoton > 0 ? reward.nanoton : 0;

  const glow =
    kind === "ton" ? "#2AA0EF" : kind === "case" ? "#7C5CFF" : isBonus ? "#FF9A2E" : "#3390ec";

  const eyebrow = isBonus ? t("quests.bonusGot") : t("quests.rewardGot");
  const title =
    kind === "gift"
      ? giftName
      : kind === "case"
        ? caseTitle
        : tonValue > 0
          ? `+${formatTON(tonValue)} TON`
          : t("quests.tonToBalance");
  const note =
    kind === "gift"
      ? t("quests.addedInventory")
      : kind === "case"
        ? t("quests.freeOpenReady")
        : t("quests.creditedBalance");
  const primaryLabel =
    kind === "gift" ? t("quests.toInventory") : kind === "case" ? t("quests.openCase") : t("common.continue");

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

  function closeThen(fn?: () => void) {
    setOpen(false);
    window.setTimeout(() => {
      onClose();
      fn?.();
    }, 280);
  }

  function onPrimary() {
    if (kind === "gift") {
      closeThen(() => router.push(APP_ROUTES.inventory));
      return;
    }
    if (kind === "case") {
      closeThen(() => router.push(caseHref));
      return;
    }
    closeThen();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn("case-win-modal quest-claim-modal", open && "case-win-modal--open")}
      style={{ ["--case-glow" as string]: glow }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-claim-title"
    >
      <button
        type="button"
        className="case-win-modal__backdrop"
        aria-label={t("common.close")}
        onClick={() => closeThen()}
      />

      <div className="case-win-modal__body">
        <p className="case-win-modal__eyebrow">{eyebrow}</p>

        <div className="case-win-modal__prize" aria-hidden>
          <span className="case-win-modal__aura" />
          <span className="quest-gift-claim__burst" />
          {customCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={customCover}
              alt=""
              className="case-win-modal__img quest-claim-modal__card-img"
              draggable={false}
            />
          ) : kind === "ton" ? (
            <span className="case-win-modal__ton">
              <CaseTonPrizeArt />
            </span>
          ) : kind === "case" && caseCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={caseCover}
              alt=""
              className="case-win-modal__img quest-claim-modal__case-img"
              draggable={false}
            />
          ) : kind === "case" ? (
            <span className="quest-claim-modal__case-fallback">{caseTitle.slice(0, 1)}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={giftImageUrl(giftSlug, giftImage)}
              alt=""
              className="case-win-modal__img"
              draggable={false}
            />
          )}
        </div>

        <h2 id="quest-claim-title" className="case-win-modal__title">
          {title}
        </h2>

        {kind === "gift" && tonValue > 0 ? (
          <p className="case-win-modal__value">
            <TonIcon variant="brand" className="h-4 w-4" />
            {formatTON(tonValue)} TON
          </p>
        ) : null}

        <p className="case-win-modal__note">{note}</p>

        <div className="case-win-modal__actions">
          <button
            type="button"
            className="case-win-modal__btn case-win-modal__btn--primary app-control"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
          {kind !== "ton" ? (
            <button
              type="button"
              className="case-win-modal__btn case-win-modal__btn--ghost app-control"
              onClick={() => closeThen()}
            >
              {t("common.continue")}  
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated Use QuestClaimModal */
export const QuestGiftClaimModal = QuestClaimModal;
