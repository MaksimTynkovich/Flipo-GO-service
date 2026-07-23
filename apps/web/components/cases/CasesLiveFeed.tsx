"use client";

import { candyTileBackgroundForLoot } from "@/components/cases/case-ui";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatTON, type CaseLiveDrop } from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { cn } from "@/lib/utils";

function LiveTile({ drop }: { drop: CaseLiveDrop }) {
  const floor = drop.floor_price_nanoton ?? 0;

  return (
    <article className="cases-live-feed__tile" title={drop.display_name}>
      <div
        className="cases-live-feed__frame"
        style={{ background: candyTileBackgroundForLoot(drop) }}
      >
        {floor > 0 ? (
          <span className="cases-live-feed__price">
            {formatTON(floor)}
            <TonIcon variant="brand" className="cases-live-feed__price-icon" aria-hidden />
          </span>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={giftImageUrl(drop.collection_slug, drop.image_url)}
          alt=""
          className="cases-live-feed__img"
          draggable={false}
        />
      </div>
    </article>
  );
}

export function CasesLiveFeed({
  items,
  className,
}: {
  items: CaseLiveDrop[];
  className?: string;
}) {
  const visible = items.slice(0, 6);
  if (visible.length === 0) return null;

  return (
    <section className={cn("cases-live-feed", className)} aria-label="Лента выигрышей">
      <div className="cases-live-feed__live" aria-hidden>
        <span className="cases-live-feed__dot" />
      </div>
      <div className="cases-live-feed__row">
        {visible.map((drop) => (
          <LiveTile key={drop.open_id} drop={drop} />
        ))}
      </div>
    </section>
  );
}
