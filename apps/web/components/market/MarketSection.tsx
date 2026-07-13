"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketGiftCard, MarketGiftCardSkeleton } from "@/components/market/MarketGiftCard";
import { MarketGiftDetailSheet } from "@/components/market/MarketGiftDetailSheet";
import { MarketToolbar, type MarketSort } from "@/components/market/MarketToolbar";
import { useAuth } from "@/components/providers/AuthProvider";
import { buyMarketListing, getMarketListings, MarketListing } from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { markModalCompleted } from "@/lib/analytics";
import { mainBalanceNanoton } from "@/lib/balance";
import { formatCollectionSlug } from "@/lib/gifts";
import { formatUserError } from "@/lib/user-errors";
import { Gift, SearchX } from "lucide-react";

type Props = {
  onPurchased?: () => void;
};

function listingSearchText(listing: MarketListing): string {
  return [
    listing.item.name,
    listing.item.sub_name,
    listing.item.collection_slug,
    formatCollectionSlug(listing.item.collection_slug),
    listing.item.model,
    listing.item.symbol,
    listing.item.backdrop,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterAndSortListings(
  listings: MarketListing[],
  query: string,
  sort: MarketSort,
  selectedCollections: string[],
): MarketListing[] {
  const q = query.trim().toLowerCase();
  const collectionSet =
    selectedCollections.length > 0 ? new Set(selectedCollections) : null;

  let next = listings.filter((listing) => {
    if (collectionSet && !collectionSet.has(listing.item.collection_slug)) return false;
    if (q && !listingSearchText(listing).includes(q)) return false;
    return true;
  });

  next = [...next].sort((a, b) => {
    if (sort === "price_asc") return a.price_nanoton - b.price_nanoton;
    if (sort === "price_desc") return b.price_nanoton - a.price_nanoton;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return next;
}

export function MarketSection({ onPurchased }: Props) {
  const { user, setUser, ready } = useAuth();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MarketSort>("newest");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
        setListings(await getMarketListings());
        setLoading(false);
        return;
      } catch (e) {
        lastError = e;
      }
    }
    setLoadError(formatUserError(lastError, "Не удалось загрузить маркет"));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of listings) {
      const slug = listing.item.collection_slug;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([slug]) => slug);
  }, [listings]);

  useEffect(() => {
    setSelectedCollections((prev) => {
      const next = prev.filter((slug) => collections.includes(slug));
      return next.length === prev.length ? prev : next;
    });
  }, [collections]);

  const visibleListings = useMemo(
    () => filterAndSortListings(listings, query, sort, selectedCollections),
    [listings, query, sort, selectedCollections],
  );

  const hasActiveFilters = Boolean(
    query.trim() || selectedCollections.length > 0 || sort !== "newest",
  );

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
      setError(formatUserError(e, "Ошибка покупки"));
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
      {!loading && listings.length > 0 ? (
        <MarketToolbar
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          selectedCollections={selectedCollections}
          onSelectedCollectionsChange={setSelectedCollections}
          collections={collections}
        />
      ) : null}

      <div className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
        {loading
          ? Array.from({ length: 9 }).map((_, i) => <MarketGiftCardSkeleton key={i} />)
          : visibleListings.map((listing) => (
              <MarketGiftCard key={listing.id} listing={listing} onClick={setSelected} />
            ))}
      </div>

      {!loading && loadError && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <SearchX className="h-7 w-7 text-muted/40" strokeWidth={1.5} />
          <p className="text-sm font-medium">Не удалось загрузить</p>
          <p className="max-w-[15rem] text-xs leading-relaxed text-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold text-accent"
          >
            Повторить
          </button>
        </div>
      )}

      {!loading && !loadError && listings.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Gift className="h-7 w-7 text-muted/40" strokeWidth={1.5} />
          <p className="text-sm font-medium">Маркет пуст</p>
          <p className="max-w-[15rem] text-xs leading-relaxed text-muted">
            Лоты появятся, когда игроки выставят предметы
          </p>
        </div>
      )}

      {!loading && listings.length > 0 && visibleListings.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <SearchX className="h-7 w-7 text-muted/40" strokeWidth={1.5} />
          <p className="text-sm font-medium">Ничего не найдено</p>
          <p className="max-w-[15rem] text-xs leading-relaxed text-muted">
            Попробуйте другой запрос или сбросьте фильтры
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedCollections([]);
                setSort("newest");
              }}
              className="mt-1 text-xs font-semibold text-accent"
            >
              Сбросить
            </button>
          ) : null}
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
