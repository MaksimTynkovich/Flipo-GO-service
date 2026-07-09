"use client";

import { useEffect, useState } from "react";
import { MarketGiftCard, MarketGiftCardSkeleton } from "@/components/market/MarketGiftCard";
import { MarketGiftDetailSheet } from "@/components/market/MarketGiftDetailSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { buyMarketListing, getMarketListings, MarketListing } from "@/lib/api";
import { markModalCompleted } from "@/lib/analytics";
import { mainBalanceNanoton } from "@/lib/balance";
import { Gift } from "lucide-react";

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
      const { balance, promo_balance } = await buyMarketListing(selected.id);
      markModalCompleted("market_gift_detail");
      setUser({ ...user, betting_balance: balance, promo_balance });
      setSelected(null);
      await load();
      onPurchased?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка покупки");
    } finally {
      setBuying(false);
    }
  }

  const availableBalance = user ? mainBalanceNanoton(user) : 0;
  const canBuy =
    !!user &&
    !!selected &&
    availableBalance >= selected.price_nanoton &&
    selected.seller.id !== user.id;
  const insufficientFunds = !!user && availableBalance < (selected?.price_nanoton ?? 0);
  const promoRestricted =
    !!user &&
    !!selected &&
    user.betting_balance >= selected.price_nanoton &&
    availableBalance < selected.price_nanoton;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <MarketGiftCardSkeleton key={i} />)
          : listings.map((listing) => (
              <MarketGiftCard key={listing.id} listing={listing} onClick={setSelected} />
            ))}
      </div>

      {!loading && listings.length === 0 && (
        <div className="panel py-10 text-center">
          <Gift className="mx-auto h-8 w-8 text-muted/50" />
          <p className="mt-3 text-sm font-medium">Маркет пуст</p>
          <p className="mt-1 text-xs text-muted">Лоты появятся, когда игроки выставят предметы</p>
        </div>
      )}

      {selected && (
        <MarketGiftDetailSheet
          listing={selected}
          buying={buying}
          error={error}
          canBuy={canBuy}
          isOwnListing={!!user && selected.seller.id === user.id}
          isLoggedIn={!!user}
          insufficientFunds={insufficientFunds}
          promoRestricted={promoRestricted}
          onClose={() => {
            setSelected(null);
            setError(null);
          }}
          onBuy={handleBuy}
        />
      )}
    </>
  );
}
