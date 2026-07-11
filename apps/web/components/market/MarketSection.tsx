"use client";

import { useEffect, useState } from "react";
import { MarketGiftCard, MarketGiftCardSkeleton } from "@/components/market/MarketGiftCard";
import { MarketGiftDetailSheet } from "@/components/market/MarketGiftDetailSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { buyMarketListing, getMarketListings, MarketListing } from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
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
      setUser((prev) =>
        prev ? patchUserBalance(prev, { betting_balance: balance, promo_balance }) : prev,
      );
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
    <section className="space-y-4">
      <header className="space-y-1 px-0.5">
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground">
          Маркет
        </h1>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Подарки за TON — бери и забирай в инвентарь
        </p>
      </header>

      <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <MarketGiftCardSkeleton key={i} />)
          : listings.map((listing) => (
              <MarketGiftCard key={listing.id} listing={listing} onClick={setSelected} />
            ))}
      </div>

      {!loading && listings.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Gift className="h-7 w-7 text-muted/40" strokeWidth={1.5} />
          <p className="text-sm font-medium">Маркет пуст</p>
          <p className="max-w-[15rem] text-xs leading-relaxed text-muted">
            Лоты появятся, когда игроки выставят предметы
          </p>
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
    </section>
  );
}
