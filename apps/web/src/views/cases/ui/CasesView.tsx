"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatCasePrice } from "@/components/cases/case-ui";
import { getCasesCatalog, resolveAsset, type CaseView, type CasesCatalog } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

function priceLabel(caseItem: CaseView): { text: string; free: boolean; muted?: boolean } {
  const isDaily = caseItem.kind === "daily";
  const isFree = isDaily || caseItem.price_nanoton <= 0;
  if (isDaily && caseItem.daily_available === false) {
    return { text: "Завтра", free: true, muted: true };
  }
  if (isFree) {
    return {
      text: caseItem.require_channel ? "Free · подписка" : "Бесплатно",
      free: true,
    };
  }
  return { text: `${formatCasePrice(caseItem.price_nanoton)} TON`, free: false };
}

/** Neutral card — cover art is the only color; chrome stays the same for every case. */
function CaseCard({
  caseItem,
  layout,
}: {
  caseItem: CaseView;
  layout: "wide" | "tile";
}) {
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const cover = resolveAsset(caseItem.image_url?.trim()) || "";
  const price = priceLabel(caseItem);

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101820]",
        layout === "wide" ? "aspect-[5/4]" : "aspect-[4/5]",
      )}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-active:scale-[1.02]"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0 bg-[#121a24]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(255,255,255,0.04), transparent 70%)",
          }}
          aria-hidden
        />
      )}

      {/* Soft scrim — same for every card so any cover stays readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,18,0.15) 0%, rgba(8,12,18,0.05) 42%, rgba(8,12,18,0.78) 100%)",
        }}
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 z-[1] flex items-end justify-between gap-2 p-3">
        <h3
          className={cn(
            "min-w-0 flex-1 truncate font-semibold tracking-tight text-white",
            layout === "wide" ? "text-[15px]" : "text-[13px]",
          )}
        >
          {caseItem.title}
        </h3>
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold tabular-nums backdrop-blur-md",
            price.muted
              ? "bg-white/10 text-white/45"
              : price.free
                ? "bg-white/12 text-emerald-200"
                : "bg-black/55 text-white",
          )}
        >
          {!price.free && !price.muted ? (
            <TonIcon variant="brand" className="h-3.5 w-3.5" />
          ) : null}
          {price.text}
        </span>
      </div>
    </Link>
  );
}

export function CasesView() {
  const [data, setData] = useState<CasesCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCasesCatalog());
    } catch (e) {
      setError(formatUserError(e, "Не удалось загрузить кейсы"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featuredRow = data
    ? [...data.featured, ...(data.daily ? [data.daily] : [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      )
    : [];

  return (
    <PageShell flush>
      <div className="space-y-5 pb-2">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        ) : null}

        {data ? (
          <>
            {data.banners_enabled && featuredRow.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {featuredRow.map((item) => (
                  <CaseCard key={item.id} caseItem={item} layout="wide" />
                ))}
              </div>
            ) : null}

            <section>
              {data.banners_enabled ? (
                <h2 className="mb-2.5 text-[15px] font-medium tracking-tight text-white/55">
                  Каталог
                </h2>
              ) : null}
              {data.catalog.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface/60 py-12 text-muted">
                  <Gift className="h-7 w-7 opacity-35" />
                  <p className="text-sm">Пока нет кейсов</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {data.catalog.map((item) => (
                    <CaseCard key={item.id} caseItem={item} layout="tile" />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
