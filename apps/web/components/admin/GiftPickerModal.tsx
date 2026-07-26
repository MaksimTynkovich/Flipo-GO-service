"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AdminButton } from "@/components/admin/admin-ui";
import {
  fetchChangesGiftCollections,
  fetchChangesGiftModelsForCollection,
  filterByNameQuery,
  type ChangesGiftCollection,
  type ChangesGiftModelVariant,
  type GiftPickerSelection,
} from "@/lib/changes-gifts";
import { cn } from "@/lib/utils";

type GiftPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (gift: GiftPickerSelection) => void;
  /** Keys: `${collectionSlug}` for collection-only, `${collectionSlug}\0${modelName}` for models */
  excludeKeys?: Set<string>;
  /** @deprecated use excludeKeys */
  excludeSlugs?: Set<string>;
  /** Open directly on this collection's models (by slug, e.g. lolpop). */
  initialCollectionSlug?: string;
  title?: string;
};

function lootKey(collectionSlug: string, modelName = ""): string {
  return modelName ? `${collectionSlug}\0${modelName}` : collectionSlug;
}

export function GiftPickerModal({
  open,
  onClose,
  onSelect,
  excludeKeys,
  excludeSlugs,
  initialCollectionSlug,
  title,
}: GiftPickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [collections, setCollections] = useState<ChangesGiftCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<ChangesGiftCollection | null>(null);
  const [models, setModels] = useState<ChangesGiftModelVariant[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const blocked = excludeKeys ?? excludeSlugs;
  const initialSlug = (initialCollectionSlug || "").trim().toLowerCase();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChangesGiftCollections();
      setCollections(data);
      if (initialSlug) {
        const match = data.find((c) => c.collectionSlug === initialSlug) ?? null;
        setSelectedCollection(match);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки каталога");
    } finally {
      setLoading(false);
    }
  }, [initialSlug]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      setQuery("");
      setSelectedCollection(null);
      setModels([]);
      setModelsError(null);
      return;
    }
    void load();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedCollection) {
          setSelectedCollection(null);
          setQuery("");
          return;
        }
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, selectedCollection]);

  useEffect(() => {
    if (!selectedCollection) {
      setModels([]);
      setModelsError(null);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);
    void fetchChangesGiftModelsForCollection(selectedCollection.name)
      .then((rows) => {
        if (!cancelled) setModels(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setModelsError(e instanceof Error ? e.message : "Ошибка загрузки моделей");
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollection]);

  const filteredCollections = useMemo(
    () => filterByNameQuery(collections, query),
    [collections, query],
  );

  const filteredModels = useMemo(
    () => filterByNameQuery(models, query),
    [models, query],
  );

  function pick(selection: GiftPickerSelection) {
    onSelect(selection);
    onClose();
  }

  function pickCollectionRandom(c: ChangesGiftCollection) {
    pick({
      collectionName: c.name,
      collectionSlug: c.collectionSlug,
      modelName: "",
      displayName: c.name,
      previewUrl: c.previewUrl,
    });
  }

  function pickModel(c: ChangesGiftCollection, m: ChangesGiftModelVariant) {
    pick({
      collectionName: c.name,
      collectionSlug: c.collectionSlug,
      modelName: m.name,
      displayName: m.name,
      previewUrl: m.previewUrl,
    });
  }

  if (!mounted || !open) return null;

  const inModels = Boolean(selectedCollection);

  return createPortal(
    <div
      className={cn("admin-gift-picker", visible && "admin-gift-picker--open")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift-picker-title"
    >
      <button
        type="button"
        className="admin-gift-picker__backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div className="admin-gift-picker__panel">
        <header className="admin-gift-picker__header">
          <div>
            <h2 id="gift-picker-title" className="text-base font-medium text-[var(--admin-fg)]">
              {inModels
                ? selectedCollection!.name
                : title?.trim() || "Выбор подарка"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
              {inModels
                ? "Коллекция = original · модель = своя картинка"
                : title?.trim()
                  ? "Выберите коллекцию или вернитесь к смене модели"
                  : "Сначала коллекция · превью original с api.changes.tg"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inModels ? (
              <AdminButton
                variant="secondary"
                className="!h-8"
                onClick={() => {
                  setSelectedCollection(null);
                  setQuery("");
                }}
              >
                ← Коллекции
              </AdminButton>
            ) : null}
            <AdminButton variant="secondary" className="!h-8" onClick={onClose}>
              Закрыть
            </AdminButton>
          </div>
        </header>

        <div className="admin-gift-picker__search">
          <input
            className="input-field w-full"
            placeholder={inModels ? "Поиск модели…" : "Поиск коллекции…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="admin-gift-picker__body">
          {!inModels ? (
            loading ? (
              <div className="admin-gift-picker__status">Загрузка коллекций…</div>
            ) : error ? (
              <div className="admin-gift-picker__status space-y-2">
                <p>{error}</p>
                <AdminButton variant="secondary" onClick={() => void load()}>
                  Повторить
                </AdminButton>
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="admin-gift-picker__status">Ничего не найдено</div>
            ) : (
              <div className="admin-gift-picker__grid">
                {filteredCollections.map((c) => {
                  const taken = blocked?.has(lootKey(c.collectionSlug));
                  return (
                    <button
                      key={c.collectionSlug}
                      type="button"
                      className="admin-gift-picker__card"
                      onClick={() => {
                        setQuery("");
                        setSelectedCollection(c);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.previewUrl}
                        alt=""
                        className="admin-gift-picker__img"
                        loading="lazy"
                      />
                      <span className="admin-gift-picker__name">{c.name}</span>
                      <span className="admin-gift-picker__slug">{c.collectionSlug}</span>
                      {taken ? (
                        <span className="admin-gift-picker__badge">коллекция уже в кейсе</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )
          ) : modelsLoading ? (
            <div className="admin-gift-picker__status">Загрузка моделей…</div>
          ) : modelsError ? (
            <div className="admin-gift-picker__status space-y-2">
              <p>{modelsError}</p>
              <AdminButton
                variant="secondary"
                onClick={() => {
                  const c = selectedCollection;
                  setSelectedCollection(null);
                  queueMicrotask(() => setSelectedCollection(c));
                }}
              >
                Повторить
              </AdminButton>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const c = selectedCollection!;
                const taken = blocked?.has(lootKey(c.collectionSlug));
                return (
                  <button
                    type="button"
                    disabled={taken}
                    className={cn(
                      "admin-gift-picker__card w-full !flex-row !items-center !gap-3 !p-3 text-left",
                      taken && "admin-gift-picker__card--disabled",
                    )}
                    onClick={() => pickCollectionRandom(c)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.previewUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">Любая модель (рандом)</span>
                      <span className="block text-xs text-[var(--admin-muted)]">
                        Случайный подарок из {c.name}
                      </span>
                    </span>
                    {taken ? (
                      <span className="admin-gift-picker__badge">уже в кейсе</span>
                    ) : null}
                  </button>
                );
              })()}

              {filteredModels.length === 0 ? (
                <div className="admin-gift-picker__status">Модели не найдены</div>
              ) : (
                <div className="admin-gift-picker__grid">
                  {filteredModels.map((m) => {
                    const c = selectedCollection!;
                    const taken = blocked?.has(lootKey(c.collectionSlug, m.name));
                    return (
                      <button
                        key={m.name}
                        type="button"
                        disabled={taken}
                        className={cn(
                          "admin-gift-picker__card",
                          taken && "admin-gift-picker__card--disabled",
                        )}
                        onClick={() => pickModel(c, m)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.previewUrl}
                          alt=""
                          className="admin-gift-picker__img"
                          loading="lazy"
                        />
                        <span className="admin-gift-picker__name">{m.name}</span>
                        <span className="admin-gift-picker__slug">
                          {m.rarityPermille != null
                            ? `${(m.rarityPermille / 10).toFixed(1)}%`
                            : c.collectionSlug}
                        </span>
                        {taken ? (
                          <span className="admin-gift-picker__badge">уже в кейсе</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-[var(--admin-border)] px-4 py-2 text-[10px] text-[var(--admin-muted)]">
          thanks to @GiftChanges for this API (api.changes.tg)
        </footer>
      </div>
    </div>,
    document.body,
  );
}
