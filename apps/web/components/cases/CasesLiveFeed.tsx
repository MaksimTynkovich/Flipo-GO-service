"use client";

import { useEffect, useRef, useState } from "react";
import { candyTileBackgroundForLoot } from "@/components/cases/case-ui";
import { CaseTonPrizeArt, CaseMiniTonPrice, CASE_TON_TILE_BACKGROUND } from "@/components/cases/CaseTonPrizeArt";
import {
  changesGiftCollectionImageUrl,
  isChangesGiftImageUrl,
} from "@/lib/changes-gifts";
import { resolveAsset, type CaseLiveDrop } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

function collectionHint(drop: CaseLiveDrop): string {
  const fromDisplay = drop.display_name?.split("·")[0]?.trim() ?? "";
  if (fromDisplay.length > 1) return fromDisplay;
  return drop.collection_slug?.trim() ?? "";
}

function liveDropImageCandidates(drop: CaseLiveDrop): string[] {
  const out: string[] = [];
  const push = (url?: string) => {
    const v = url?.trim();
    if (!v || out.includes(v)) return;
    out.push(v);
  };

  const resolved = resolveAsset(drop.image_url?.trim()) || drop.image_url?.trim();
  if (resolved) {
    if (isChangesGiftImageUrl(resolved)) {
      push(resolved);
    } else if (!resolved.includes("nft.fragment.com")) {
      push(giftImageUrl(drop.collection_slug, resolved));
      push(resolved);
    } else {
      push(giftImageUrl(drop.collection_slug, resolved));
    }
  }

  const hint = collectionHint(drop);
  if (hint) {
    push(changesGiftCollectionImageUrl(hint));
  }
  if (drop.collection_slug) {
    push(giftImageUrl(drop.collection_slug, drop.image_url));
  }
  return out;
}

function LiveTile({ drop, fresh }: { drop: CaseLiveDrop; fresh?: boolean }) {
  const isTon = drop.prize_type === "ton";
  const candidates = isTon ? [] : liveDropImageCandidates(drop);
  const [imgIndex, setImgIndex] = useState(0);
  const src = candidates[imgIndex] ?? "";
  const price = drop.floor_price_nanoton > 0 ? drop.floor_price_nanoton : 0;
  const title = [drop.display_name, drop.backdrop?.trim()].filter(Boolean).join(" · ");

  return (
    <article
      className={cn("cases-live__tile", fresh && "cases-live__tile--fresh")}
      title={title}
      data-fresh={fresh ? "1" : undefined}
    >
      <div
        className="cases-live__frame"
        style={{
          background: isTon ? CASE_TON_TILE_BACKGROUND : candyTileBackgroundForLoot(drop),
        }}
      >
        <span className="cases-live__shine" aria-hidden />

        {price > 0 ? (
          <CaseMiniTonPrice nanoton={price} className="cases-live__price" />
        ) : null}

        {drop.backdrop ? (
          <span className="cases-live__backdrop" aria-hidden>
            {drop.backdrop === "Onyx Black" ? "Onyx" : "Black"}
          </span>
        ) : null}

        {isTon ? (
          <span className="cases-live__ton">
            <CaseTonPrizeArt />
          </span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="cases-live__img"
            draggable={false}
            onError={() => {
              setImgIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
            }}
          />
        ) : (
          <span className="cases-live__fallback" aria-hidden>
            ★
          </span>
        )}
      </div>
    </article>
  );
}

export function CasesLiveFeed({
  items,
  className,
  freshOpenId,
}: {
  items: CaseLiveDrop[];
  className?: string;
  /** Highlight the newest realtime drop. */
  freshOpenId?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const visible = items.slice(0, 10);
  const hasFresh = Boolean(freshOpenId && visible.some((d) => d.open_id === freshOpenId));

  useEffect(() => {
    if (!freshOpenId) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "smooth" });
  }, [freshOpenId]);

  if (visible.length === 0) return null;

  return (
    <section
      className={cn("cases-live", hasFresh && "cases-live--fresh", className)}
      aria-label="Лента выигрышей"
    >
      <div className="cases-live__row">
        <div className="cases-live__badge" aria-hidden>
          <span className="cases-live__dot" />
          <span className="cases-live__label">LIVE</span>
        </div>

        <div ref={scrollerRef} className="cases-live__scroller">
          <div className="cases-live__track">
            {visible.map((drop) => (
              <LiveTile
                key={drop.open_id}
                drop={drop}
                fresh={Boolean(freshOpenId && drop.open_id === freshOpenId)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
