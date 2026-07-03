"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarketGiftCard, MarketGiftCardSkeleton } from "@/components/market/MarketGiftCard";
import { useAuth } from "@/components/providers/AuthProvider";
import { buyMarketListing, formatTON, getMarketListings, MarketListing } from "@/lib/api";
import { giftGradient, giftImageUrl } from "@/lib/gifts";
import { Gift, X } from "lucide-react";

type Props = {
  onPurchased?: () => void;
};

export function MarketSection({ onPurchased }: Props) {
  const { user, setUser } = useAuth();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setListings(await getMarketListings());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleBuy() {
    if (!selected || !user) return;
    setBuying(true);
    setError(null);
    try {
      const { balance } = await buyMarketListing(selected.id);
      setUser({ ...user, betting_balance: balance });
      setSelected(null);
      await load();
      onPurchased?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка покупки");
    } finally {
      setBuying(false);
    }
  }

  const canBuy =
    user &&
    selected &&
    user.betting_balance >= selected.price_nanoton &&
    selected.seller.id !== user.id;

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <MarketGiftCardSkeleton key={i} />)
          : listings.map((listing) => (
              <MarketGiftCard key={listing.id} listing={listing} onClick={setSelected} />
            ))}
      </div>

      {!loading && listings.length === 0 && (
        <div className="panel py-8 text-center text-sm text-muted">Маркет пуст</div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="panel w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{selected.item.name}</p>
                {selected.item.sub_name && (
                  <p className="text-sm text-muted">{selected.item.sub_name}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setError(null);
                }}
                className="rounded-lg p-1 text-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl"
              style={{ background: giftGradient(selected.item.collection_slug) }}
            >
              <img
                src={giftImageUrl(
                  `${selected.item.collection_slug}-${selected.item.sub_name?.replace("#", "")}`,
                  selected.item.image_url,
                )}
                alt={selected.item.name}
                className="max-h-[70%] max-w-[70%] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {!selected.item.image_url && (
                <Gift className="absolute h-10 w-10 text-white/30" />
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Продавец</span>
              <span className="font-medium">@{selected.seller.username}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Цена</span>
              <span className="text-lg font-bold tabular-nums text-accent">
                {formatTON(selected.price_nanoton)} TON
              </span>
            </div>

            {user && (
              <p className="text-xs text-muted">
                Ваш баланс: {formatTON(user.betting_balance)} TON
              </p>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            {!user ? (
              <p className="text-center text-sm text-muted">Войдите, чтобы купить</p>
            ) : selected.seller.id === user.id ? (
              <p className="text-center text-sm text-muted">Это ваш лот</p>
            ) : (
              <Button
                className="w-full"
                variant="accent"
                disabled={!canBuy || buying}
                onClick={handleBuy}
              >
                {buying
                  ? "Покупка…"
                  : user.betting_balance < selected.price_nanoton
                    ? "Недостаточно средств"
                    : "Купить"}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
