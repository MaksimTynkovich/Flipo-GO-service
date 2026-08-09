export type BetFundingMode = "balance" | "gift" | "combined";

export type BetFundingPayload = {
  funding?: BetFundingMode;
  amount_nanoton?: number;
  inventory_item_id?: string;
  inventory_item_ids?: string[];
};

export function buildBetFundingBody(
  mode: BetFundingMode,
  opts: {
    amountNanoton?: number;
    inventoryItemId?: string | null;
    inventoryItemIds?: string[];
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...(opts.extra ?? {}) };
  const giftIds =
    opts.inventoryItemIds?.length
      ? opts.inventoryItemIds
      : opts.inventoryItemId
        ? [opts.inventoryItemId]
        : [];
  const amount = opts.amountNanoton && opts.amountNanoton > 0 ? opts.amountNanoton : 0;

  if (giftIds.length > 0 && amount > 0) {
    body.funding = "combined";
    body.amount_nanoton = amount;
    body.inventory_item_ids = giftIds;
    body.inventory_item_id = giftIds[0];
    return body;
  }
  if (giftIds.length > 0 || mode === "gift") {
    body.funding = "gift";
    if (giftIds[0]) body.inventory_item_id = giftIds[0];
    if (giftIds.length > 0) body.inventory_item_ids = giftIds;
    return body;
  }
  if (amount > 0) {
    body.amount_nanoton = amount;
  }
  return body;
}
