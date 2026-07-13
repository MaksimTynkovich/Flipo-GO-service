"use client";

import { useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Check,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { formatCollectionSlug } from "@/lib/gifts";
import { cn } from "@/lib/utils";

export type MarketSort = "newest" | "price_asc" | "price_desc";

const SORT_CYCLE: MarketSort[] = ["newest", "price_asc", "price_desc"];

const SORT_META: Record<
  MarketSort,
  { label: string; Icon: typeof ArrowUpDown }
> = {
  newest: { label: "Сначала новые", Icon: ArrowUpDown },
  price_asc: { label: "Сначала дешевле", Icon: ArrowUpNarrowWide },
  price_desc: { label: "Сначала дороже", Icon: ArrowDownWideNarrow },
};

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  sort: MarketSort;
  onSortChange: (value: MarketSort) => void;
  selectedCollections: string[];
  onSelectedCollectionsChange: (value: string[]) => void;
  collections: string[];
};

export function MarketToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedCollections,
  onSelectedCollectionsChange,
  collections,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftCollections, setDraftCollections] = useState<string[]>([]);

  const SortIcon = SORT_META[sort].Icon;
  const filtersActive = selectedCollections.length > 0;
  const showCollectionFilters = collections.length > 1;

  function openFilters() {
    setDraftCollections(selectedCollections);
    setFiltersOpen(true);
  }

  function toggleDraftCollection(slug: string) {
    setDraftCollections((prev) =>
      prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug],
    );
  }

  function applyFilters() {
    onSelectedCollectionsChange(draftCollections);
    setFiltersOpen(false);
  }

  function clearDraft() {
    setDraftCollections([]);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="input-inset min-w-0 flex-1 gap-2.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.8} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              // Keep the app frame pinned when the soft keyboard opens.
              window.scrollTo(0, 0);
              document.documentElement.scrollTop = 0;
              document.body.scrollTop = 0;
            }}
            placeholder="Поиск"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Очистить поиск"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-opacity active:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() =>
            onSortChange(SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length])
          }
          aria-label={SORT_META[sort].label}
          className={cn(
            "app-control relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted",
            sort !== "newest" && "text-accent",
          )}
        >
          <SortIcon className="h-4 w-4" strokeWidth={2} />
        </button>

        {showCollectionFilters ? (
          <button
            type="button"
            onClick={openFilters}
            aria-label="Фильтры"
            aria-expanded={filtersOpen}
            className={cn(
              "app-control relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted",
              filtersActive && "text-accent",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            {filtersActive ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
        ) : null}
      </div>

      {filtersOpen ? (
        <ModalOverlay onClose={() => setFiltersOpen(false)} analyticsModalId="market_filters">
          {(close) => (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Фильтры маркета"
              className="sheet-panel relative mx-auto flex w-full max-w-lg max-h-[84dvh] flex-col"
            >
              <div className="shrink-0 px-4 pt-2">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
                <div className="relative flex items-center justify-center pb-4">
                  {draftCollections.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="absolute left-0 top-1/2 -translate-y-1/2 text-xs font-medium text-muted transition-colors active:text-foreground"
                    >
                      Сбросить
                    </button>
                  ) : null}
                  <p className="text-[15px] font-semibold text-foreground">Коллекции</p>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Закрыть"
                    className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised text-muted transition-opacity active:opacity-70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1">
                <ul className="market-filter-list">
                  {collections.map((slug) => {
                    const checked = draftCollections.includes(slug);
                    return (
                      <li key={slug}>
                        <button
                          type="button"
                          onClick={() => toggleDraftCollection(slug)}
                          className={cn(
                            "market-filter-row app-control",
                            checked && "market-filter-row--checked",
                          )}
                          aria-pressed={checked}
                        >
                          <span
                            className={cn(
                              "market-filter-check",
                              checked && "market-filter-check--on",
                            )}
                            aria-hidden
                          >
                            {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                          </span>
                          <span className="market-filter-row__label capitalize">
                            {formatCollectionSlug(slug)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="shrink-0 border-t border-[var(--border)] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
                <Button
                  className="h-12 w-full rounded-2xl text-[15px] font-semibold"
                  onClick={applyFilters}
                >
                  Готово
                  {draftCollections.length > 0 ? ` · ${draftCollections.length}` : ""}
                </Button>
              </div>
            </div>
          )}
        </ModalOverlay>
      ) : null}
    </div>
  );
}
