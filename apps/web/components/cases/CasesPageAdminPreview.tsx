"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { CasesCatalogScreen } from "@/components/cases/CasesCatalogScreen";
import { resolveAsset, type AdminCase, type CaseView } from "@/lib/api";
import { cn } from "@/lib/utils";

function adminToView(c: AdminCase): CaseView {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    image_url: c.image_url,
    accent_color: c.accent_color,
    price_nanoton: c.price_nanoton,
    kind: c.kind,
    sort_order: c.sort_order,
    require_channel: c.require_channel,
  };
}

function kindLabel(kind: string, bannersEnabled: boolean): string {
  if (kind === "promo") return "Промокод";
  if (!bannersEnabled) {
    // Without banners everything sits in the catalog grid.
    return kind === "daily" ? "Daily" : "Каталог";
  }
  if (kind === "featured") return "Баннер";
  if (kind === "daily") return "Баннер · Daily";
  return "Каталог";
}

export function CasesPageAdminPreview({
  cases,
  bannersEnabled,
  selectedId,
  draftOverlay,
  onSelect,
  onReorder,
  savingOrder,
}: {
  cases: AdminCase[];
  bannersEnabled: boolean;
  selectedId?: string | null;
  /** Live overlay from the editor draft (same id). */
  draftOverlay?: Partial<AdminCase> & { id?: string } | null;
  onSelect: (c: AdminCase) => void;
  onReorder: (orderedIds: string[]) => void;
  savingOrder?: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const active = cases.filter((c) => c.active);
    return [...active].sort(
      (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
    );
  }, [cases]);

  const previewCases: CaseView[] = useMemo(() => {
    return ordered.map((c) => {
      let view = adminToView(c);
      if (draftOverlay?.id && draftOverlay.id === c.id) {
        view = {
          ...view,
          title: draftOverlay.title?.trim() || view.title,
          image_url: draftOverlay.image_url ?? view.image_url,
          accent_color: draftOverlay.accent_color ?? view.accent_color,
          price_nanoton: draftOverlay.price_nanoton ?? view.price_nanoton,
          kind: draftOverlay.kind || view.kind,
          require_channel: draftOverlay.require_channel ?? view.require_channel,
          sort_order: draftOverlay.sort_order ?? view.sort_order,
        };
      }
      return view;
    });
  }, [ordered, draftOverlay]);

  function move(id: string, dir: -1 | 1) {
    const idx = ordered.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= ordered.length) return;
    const copy = [...ordered];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onReorder(copy.map((c) => c.id));
  }

  function applyDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const from = ordered.findIndex((c) => c.id === dragId);
    const to = ordered.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const copy = [...ordered];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onReorder(copy.map((c) => c.id));
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="admin-cases-vitrine">
      <div className="admin-cases-vitrine__list">
        {ordered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted">
            Нет активных кейсов для витрины
          </p>
        ) : (
          <ul className="admin-cases-vitrine__list-scroll space-y-1.5 pr-0.5">
            {ordered.map((c, idx) => {
              const cover = resolveAsset(c.image_url?.trim()) || "";
              const isDrag = dragId === c.id;
              const isOver = overId === c.id && dragId && dragId !== c.id;
              return (
                <li
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", c.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== c.id) setOverId(c.id);
                  }}
                  onDragLeave={() => {
                    if (overId === c.id) setOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    applyDrop(c.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border bg-[var(--admin-raised,#1c222d)] px-2 py-1.5 transition-colors",
                    selectedId === c.id
                      ? "border-accent/50 bg-accent/10"
                      : "border-white/[0.06]",
                    isDrag && "opacity-45",
                    isOver && "border-accent/70 bg-accent/15",
                  )}
                >
                  <span
                    className="inline-flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                    title="Перетащить"
                    aria-hidden
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>

                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    onClick={() => onSelect(c)}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#101820]">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 bg-white/[0.04]" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.title || c.slug}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        #{idx + 1} · {kindLabel(c.kind, bannersEnabled)}
                        {!c.active ? " · выкл" : ""}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-muted hover:bg-white/5 disabled:opacity-30"
                      disabled={idx === 0 || savingOrder}
                      title="Выше"
                      onClick={() => move(c.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-muted hover:bg-white/5 disabled:opacity-30"
                      disabled={idx === ordered.length - 1 || savingOrder}
                      title="Ниже"
                      onClick={() => move(c.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="admin-case-preview-frame admin-cases-vitrine__preview"
        aria-label="Предпросмотр страницы кейсов"
      >
        <div className="admin-cases-vitrine__preview-scroll">
          <CasesCatalogScreen
            cases={previewCases}
            bannersEnabled={bannersEnabled}
            flatOrder={!bannersEnabled}
            interactive={false}
            selectedId={selectedId}
            onCaseClick={(item) => {
              const found = cases.find((c) => c.id === item.id);
              if (found) onSelect(found);
            }}
          />
        </div>
      </div>
    </div>
  );
}
