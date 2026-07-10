"use client";

import { X } from "lucide-react";
import { TonAmount } from "@/components/icons/TonIcon";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { formatTON } from "@/lib/api";
import { formatCollectionSlug, giftImageUrl } from "@/lib/gifts";
import { PvpGift, PvpPlayer, pvpPlayerName } from "@/lib/pvp";

type Props = {
  player: PvpPlayer;
  stakeNanoton: number;
  onClose: () => void;
};

function giftValueNanoton(gift: PvpGift, fallback: number): number {
  if (gift.value_nanoton && gift.value_nanoton > 0) return gift.value_nanoton;
  return fallback;
}

export function PvpStakeDetailSheet({ player, stakeNanoton, onClose }: Props) {
  const gifts = player.gift ? [player.gift] : [];

  return (
    <ModalOverlay onClose={onClose} analyticsModalId="pvp_stake_detail">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ставка игрока"
        className="relative mx-auto flex w-full max-w-lg max-h-[min(92dvh,100%)] flex-col rounded-t-[1.75rem] bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
      >
        <div className="shrink-0 px-4 pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />

          <div className="relative flex items-center justify-center pb-2">
            <p className="text-center text-[15px] font-semibold">Ставка</p>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 flex size-8 items-center justify-center rounded-full text-muted"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="pb-3 text-center text-sm text-muted">{pvpPlayerName(player)}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {gifts.length === 0 ? (
            <p className="rounded-xl bg-surface-raised/60 px-3 py-4 text-center text-sm text-muted">
              Ставка в TON
            </p>
          ) : (
            <ul className="space-y-2">
              {gifts.map((gift) => {
                const value = giftValueNanoton(gift, stakeNanoton);
                const imageSrc = giftImageUrl(gift.collection_slug ?? gift.id, gift.image_url);
                return (
                  <li
                    key={gift.id}
                    className="flex items-center gap-3 rounded-xl bg-surface-raised/60 px-3 py-2.5"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{gift.name}</p>
                      {gift.collection_slug ? (
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {formatCollectionSlug(gift.collection_slug)}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      <TonAmount amount={formatTON(value)} iconSize="xs" />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Итого</span>
            <span className="text-base font-semibold tabular-nums">
              <TonAmount amount={formatTON(stakeNanoton)} iconSize="sm" />
            </span>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
