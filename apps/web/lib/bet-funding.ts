export type BetFundingMode = "balance" | "gift";

export type BetFundingPayload = {
  funding?: BetFundingMode;
  amount_nanoton?: number;
  inventory_item_id?: string;
};

export function buildBetFundingBody(
  mode: BetFundingMode,
  opts: {
    amountNanoton?: number;
    inventoryItemId?: string | null;
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...(opts.extra ?? {}) };
  if (mode === "gift" && opts.inventoryItemId) {
    body.funding = "gift";
    body.inventory_item_id = opts.inventoryItemId;
    return body;
  }
  if (opts.amountNanoton && opts.amountNanoton > 0) {
    body.amount_nanoton = opts.amountNanoton;
  }
  return body;
}
