"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AdminButton } from "@/components/admin/admin-ui";
import {
  fetchChangesGiftModels,
  filterChangesGiftModels,
  type ChangesGiftModel,
} from "@/lib/changes-gifts";
import { cn } from "@/lib/utils";

type GiftPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (gift: ChangesGiftModel) => void;
  excludeSlugs?: Set<string>;
};

export function GiftPickerModal({
  open,
  onClose,
  onSelect,
  excludeSlugs,
}: GiftPickerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ChangesGiftModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChangesGiftModels();
      setModels(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки каталога");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      setQuery("");
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
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterChangesGiftModels(models, query),
    [models, query],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn(
        "admin-gift-picker",
        visible && "admin-gift-picker--open",
      )}
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
              Выбор подарка
            </h2>
            <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
              Превью с cdn.changes.tg · Original.png
            </p>
          </div>
          <AdminButton variant="secondary" className="!h-8" onClick={onClose}>
            Закрыть
          </AdminButton>
        </header>

        <div className="admin-gift-picker__search">
          <input
            className="input-field w-full"
            placeholder="Поиск по названию модели…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="admin-gift-picker__body">
          {loading ? (
            <div className="admin-gift-picker__status">Загрузка каталога…</div>
          ) : error ? (
            <div className="admin-gift-picker__status space-y-2">
              <p>{error}</p>
              <AdminButton variant="secondary" onClick={() => void load()}>
                Повторить
              </AdminButton>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-gift-picker__status">Ничего не найдено</div>
          ) : (
            <div className="admin-gift-picker__grid">
              {filtered.map((gift) => {
                const taken = excludeSlugs?.has(gift.collectionSlug);
                return (
                  <button
                    key={gift.modelName}
                    type="button"
                    disabled={taken}
                    className={cn(
                      "admin-gift-picker__card",
                      taken && "admin-gift-picker__card--disabled",
                    )}
                    onClick={() => {
                      onSelect(gift);
                      onClose();
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gift.previewUrl}
                      alt=""
                      className="admin-gift-picker__img"
                      loading="lazy"
                    />
                    <span className="admin-gift-picker__name">{gift.displayName}</span>
                    <span className="admin-gift-picker__slug">{gift.collectionSlug}</span>
                    {taken ? (
                      <span className="admin-gift-picker__badge">уже в кейсе</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
