"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { AdminButton, AdminChip, AdminToolbar } from "@/components/admin/admin-ui";
import { useToast } from "@/components/providers/ToastProvider";
import { loadCached, primeCache, readCached, runAfterFirstPaint } from "@/lib/admin-cache";
import {
  formatTON,
  getMarketListings,
  updateAdminMarketListingPrice,
  type MarketListing,
} from "@/lib/api";

type SourceFilter = "all" | "bot" | "user";

function tonToNanoton(ton: string): number {
  const parsed = Number.parseFloat(ton.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1_000_000_000);
}

function nanotonToTonInput(nanoton: number): string {
  return (nanoton / 1_000_000_000).toFixed(2);
}

export default function MarketAdminSection() {
  const { showToast } = useToast();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await loadCached("admin:market:listings", getMarketListings);
      setListings(data);
      setDraftPrices(
        Object.fromEntries(data.map((listing) => [listing.id, nanotonToTonInput(listing.price_nanoton)])),
      );
      primeCache("admin:market:listings", data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runAfterFirstPaint(() => {
      const cached = readCached<MarketListing[]>("admin:market:listings");
      if (cached) {
        setListings(cached);
        setDraftPrices(
          Object.fromEntries(cached.map((listing) => [listing.id, nanotonToTonInput(listing.price_nanoton)])),
        );
      }
      load().catch(() => {});
    });
  }, []);

  const visibleListings = listings.filter((listing) => {
    if (sourceFilter === "all") return true;
    return listing.source === sourceFilter;
  });

  async function handleSave(listing: MarketListing) {
    const priceNanoton = tonToNanoton(draftPrices[listing.id] ?? "");
    if (priceNanoton <= 0) {
      showToast({ variant: "error", title: "Введите корректную цену" });
      return;
    }
    if (priceNanoton === listing.price_nanoton) {
      showToast({ variant: "info", title: "Цена не изменилась" });
      return;
    }

    setSavingId(listing.id);
    try {
      await updateAdminMarketListingPrice(listing.id, priceNanoton);
      setListings((prev) =>
        prev.map((item) => (item.id === listing.id ? { ...item, price_nanoton: priceNanoton } : item)),
      );
      primeCache(
        "admin:market:listings",
        listings.map((item) => (item.id === listing.id ? { ...item, price_nanoton: priceNanoton } : item)),
      );
      showToast({ variant: "success", title: `Цена обновлена: ${formatTON(priceNanoton)} TON` });
    } catch (err) {
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Не удалось обновить цену",
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageShell title="Маркет" description="Редактирование цен активных лотов на маркете.">
      <AdminToolbar>
        <AdminChip active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
          Все
        </AdminChip>
        <AdminChip active={sourceFilter === "bot"} onClick={() => setSourceFilter("bot")}>
          Бот
        </AdminChip>
        <AdminChip active={sourceFilter === "user"} onClick={() => setSourceFilter("user")}>
          Пользователи
        </AdminChip>
        <AdminButton variant="secondary" onClick={() => load().catch(() => {})}>
          Обновить
        </AdminButton>
      </AdminToolbar>

      <section className="panel space-y-3">
        <p className="text-base font-semibold">Активные лоты ({visibleListings.length})</p>

        {loading && visibleListings.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex gap-3 rounded-xl bg-surface-raised/50 p-3">
              <div className="h-14 w-14 animate-pulse rounded-lg bg-surface-raised" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
                <div className="h-8 w-28 animate-pulse rounded bg-surface-raised" />
              </div>
            </div>
          ))
        ) : visibleListings.length === 0 ? (
          <p className="text-sm text-muted">Нет активных лотов</p>
        ) : (
          visibleListings.map((listing) => (
            <div key={listing.id} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {listing.item.image_url ? (
                  <img
                    src={listing.item.image_url}
                    alt={listing.item.name}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-xs text-muted">
                    NFT
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{listing.item.name}</p>
                  <p className="text-xs text-muted">
                    {listing.item.sub_name || listing.item.collection_slug} · {listing.source === "bot" ? "бот" : "пользователь"}
                  </p>
                  <p className="text-xs text-muted">
                    Текущая цена: {formatTON(listing.price_nanoton)} TON
                  </p>
                </div>
              </div>

              <div className="flex items-end gap-2 sm:w-56">
                <label className="flex-1 text-xs text-muted">
                  Новая цена (TON)
                  <input
                    className="input-field mt-1"
                    type="text"
                    inputMode="decimal"
                    value={draftPrices[listing.id] ?? ""}
                    onChange={(e) =>
                      setDraftPrices((prev) => ({
                        ...prev,
                        [listing.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <AdminButton
                  disabled={savingId === listing.id}
                  onClick={() => handleSave(listing).catch(() => {})}
                >
                  {savingId === listing.id ? "..." : "Сохранить"}
                </AdminButton>
              </div>
            </div>
          ))
        )}
      </section>
    </PageShell>
  );
}
