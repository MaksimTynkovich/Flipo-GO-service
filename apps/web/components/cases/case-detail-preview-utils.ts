import { normalizeLootTileColor, formatCasePrice } from "@/components/cases/case-ui";
import type { CaseLootPreview } from "@/lib/api";

type LootDraftLike = {
  _key: string;
  id?: string;
  collection_slug: string;
  display_name: string;
  image_url?: string;
  rarity_label?: string;
  tile_background_color?: string;
  floor_price_nanoton?: number;
};

type CaseDraftLike = {
  kind: string;
  price_nanoton: number;
  require_channel?: boolean;
};

export function lootDraftsToPreview(rows: LootDraftLike[]): CaseLootPreview[] {
  return rows.map((row, i) => ({
    id: row.id || row._key,
    collection_slug: row.collection_slug,
    display_name: row.display_name,
    image_url: row.image_url || "",
    rarity_label: row.rarity_label || undefined,
    tile_background_color: normalizeLootTileColor(row.tile_background_color) || undefined,
    sort_order: i,
    floor_price_nanoton: row.floor_price_nanoton ?? 0,
  }));
}

export function previewCtaLabel(draft: CaseDraftLike): string {
  if (draft.kind === "promo") return "Открыть по промокоду";
  const isFree = draft.kind === "daily" || draft.price_nanoton <= 0;
  if (isFree) {
    return draft.require_channel ? "Бесплатно · подписка" : "Открыть бесплатно";
  }
  return `Открыть · ${formatCasePrice(draft.price_nanoton)} TON`;
}
