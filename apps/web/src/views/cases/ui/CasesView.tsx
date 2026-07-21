"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { TonIcon } from "@/components/icons/TonIcon";
import {
  CatalogPattern,
  FeaturedGiftCluster,
  FeaturedPattern,
  formatCasePrice,
  getCatalogAccent,
  caseHeroStyle,
  FEATURED,
} from "@/components/cases/case-ui";
import { getCasesCatalog, type CaseView, type CasesCatalog } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { Gift } from "lucide-react";

function PriceBadge({ nanoton, requireChannel }: { nanoton: number; requireChannel?: boolean }) {
  if (nanoton <= 0) {
    return (
      <span className="inline-flex h-[26px] items-center rounded-full border border-emerald-400/35 bg-emerald-500/20 px-2 text-[11px] font-semibold text-emerald-200 backdrop-blur-md">
        {requireChannel ? "Free · подписка" : "Бесплатно"}
      </span>
    );
  }
  return (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-full border border-white/15 bg-black/65 px-2 text-[11px] font-semibold tabular-nums text-white backdrop-blur-md">
      <TonIcon variant="brand" className="h-3.5 w-3.5" />
      {formatCasePrice(nanoton)} TON
    </span>
  );
}

function FeaturedCard({ caseItem }: { caseItem: CaseView }) {
  const uid = useId().replace(/:/g, "");
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const isDaily = caseItem.kind === "daily";
  const isFree = isDaily || caseItem.price_nanoton <= 0;
  const available = caseItem.daily_available !== false;
  const theme = isDaily ? FEATURED.daily : FEATURED.premium;

  return (
    <Link
      href={href}
      className="relative flex min-h-[172px] flex-col overflow-hidden rounded-[18px] border p-3.5"
      style={caseHeroStyle({ ...theme, patternVariant: isDaily ? "daily" : "premium" })}
    >
      <FeaturedPattern
        variant={isDaily ? "daily" : "premium"}
        patternId={`feat-pat-${uid}`}
      />
      <FeaturedGiftCluster />

      <div className="relative z-[1] max-w-[48%]">
        <h3 className="text-[17px] font-bold leading-none tracking-tight text-white">
          {caseItem.title}
        </h3>
      </div>

      <div className="relative z-[1] mt-auto">
        {isFree ? (
          <span
            className={`inline-flex h-8 items-center justify-center rounded-full px-3.5 text-[12.5px] font-bold ${
              isDaily && !available
                ? "bg-white/10 text-white/45"
                : "bg-[#5DBE65] text-white"
            }`}
          >
            {isDaily && !available
              ? "Завтра"
              : caseItem.require_channel
                ? "Бесплатно · подписка"
                : "Бесплатно"}
          </span>
        ) : (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#4A89DC] px-3 text-[12.5px] font-bold text-white">
            <TonIcon variant="brand" className="h-4 w-4" />
            {formatCasePrice(caseItem.price_nanoton)} TON
          </span>
        )}
      </div>
    </Link>
  );
}

function CatalogCard({ caseItem }: { caseItem: CaseView }) {
  const uid = useId().replace(/:/g, "");
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const accent = getCatalogAccent(caseItem);
  const cover = caseItem.image_url?.trim();

  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-[16px] border bg-[#0c1018]"
      style={{
        borderColor: accent.border,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="relative aspect-[1/1.02] w-full overflow-hidden"
        style={{
          background: cover
            ? "#0a0e14"
            : `
            radial-gradient(ellipse 75% 60% at 50% 40%, ${accent.glow}55 0%, transparent 65%),
            linear-gradient(180deg, ${accent.from} 0%, ${accent.to} 100%)
          `,
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <CatalogPattern slug={caseItem.slug} color={accent.glow} patternId={`cat-pat-${uid}`} />
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div
                className="aspect-square w-[66%] rounded-[20px] bg-gradient-to-br from-white/32 via-white/12 to-white/[0.04] shadow-[0_12px_32px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/25"
                aria-hidden
              />
            </div>
          </>
        )}

        <div className="absolute bottom-2.5 right-2.5 z-[1]">
          <PriceBadge
            nanoton={caseItem.price_nanoton}
            requireChannel={caseItem.require_channel}
          />
        </div>
      </div>

      <div className="flex min-h-[40px] items-center border-t border-white/[0.08] bg-[#0a0e14] px-3">
        <span className="block truncate text-[13px] font-semibold tracking-tight text-white">
          {caseItem.title}
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

  return (
    <PageShell flush>
      <div className="space-y-4 pb-2">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {loading && !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="h-[172px] animate-pulse rounded-[18px] bg-surface" />
              <div className="h-[172px] animate-pulse rounded-[18px] bg-surface" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-[16px] bg-surface" />
              ))}
            </div>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {data.featured.map((item) => (
                <FeaturedCard key={item.id} caseItem={item} />
              ))}
              {data.daily ? <FeaturedCard caseItem={data.daily} /> : null}
            </div>

            <section>
              <h2 className="mb-2.5 text-[17px] font-semibold tracking-tight text-white">
                Каталог
              </h2>
              {data.catalog.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-[16px] border border-[#2a3340] bg-surface py-10 text-muted">
                  <Gift className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Пока нет кейсов</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {data.catalog.map((item) => (
                    <CatalogCard key={item.id} caseItem={item} />
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
