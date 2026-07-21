"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { TonIcon } from "@/components/icons/TonIcon";
import { getCasesCatalog, type CaseView, type CasesCatalog } from "@/lib/api";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { Gift } from "lucide-react";

type Accent = { from: string; to: string; glow: string; border: string };

const FEATURED = {
  premium: {
    from: "#1a3558",
    mid: "#122844",
    to: "#0c1626",
    border: "rgba(74,137,220,0.45)",
    glow: "rgba(59,130,246,0.22)",
  },
  daily: {
    from: "#184a32",
    mid: "#123528",
    to: "#0c1c14",
    border: "rgba(93,190,101,0.45)",
    glow: "rgba(34,197,94,0.18)",
  },
} as const;

const CATALOG: Record<string, Accent> = {
  starter: { from: "#1f9a4a", to: "#0b3d20", glow: "#4ade80", border: "rgba(52,211,153,0.35)" },
  "pepe-love": { from: "#3f3428", to: "#17120e", glow: "#fb923c", border: "rgba(251,146,60,0.28)" },
  birthday: { from: "#7c3aed", to: "#2e1065", glow: "#c084fc", border: "rgba(192,132,252,0.35)" },
  "classic-cap": { from: "#3f4652", to: "#14181e", glow: "#94a3b8", border: "rgba(148,163,184,0.28)" },
  gold: { from: "#ca8a04", to: "#422006", glow: "#fbbf24", border: "rgba(251,191,36,0.35)" },
  diamond: { from: "#2563eb", to: "#0c1e4a", glow: "#60a5fa", border: "rgba(96,165,250,0.4)" },
  royal: { from: "#dc2626", to: "#450a0a", glow: "#f87171", border: "rgba(248,113,113,0.35)" },
  legendary: { from: "#6d28d9", to: "#1e0b3d", glow: "#a78bfa", border: "rgba(167,139,250,0.35)" },
};

function formatCasePrice(nanoton: number): string {
  const ton = nanoton / 1e9;
  if (Number.isInteger(ton)) return String(ton);
  return ton.toFixed(1).replace(/\.0$/, "");
}

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

function FeaturedPattern({ variant, patternId }: { variant: "premium" | "daily"; patternId: string }) {
  if (variant === "daily") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" aria-hidden>
        <defs>
          <pattern id={patternId} width="30" height="30" patternUnits="userSpaceOnUse">
            <rect x="10" y="12" width="10" height="9" rx="1.5" fill="none" stroke="#86efac" strokeWidth="1.15" />
            <path d="M10 15.5h10M15 12v9" stroke="#86efac" strokeWidth="1.15" />
            <path d="M12 12c0-2.2 1.4-3.2 3-3.2s3 1 3 3.2" fill="none" stroke="#86efac" strokeWidth="1.15" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    );
  }
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.11]" aria-hidden>
      <defs>
        <pattern id={patternId} width="34" height="34" patternUnits="userSpaceOnUse">
          <path
            d="M9 17l17-6.5-6.5 17-2.6-7L9 17z"
            fill="none"
            stroke="#93c5fd"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function GiftPlaceholder({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "warm" | "cool" | "gold";
}) {
  const tones = {
    default: "from-slate-200/40 to-slate-500/15",
    warm: "from-orange-300/55 to-rose-500/20",
    cool: "from-sky-300/50 to-blue-600/20",
    gold: "from-yellow-200/60 to-amber-500/25",
  };
  return (
    <div
      className={`rounded-[18px] bg-gradient-to-br ${tones[tone]} shadow-[0_8px_22px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/30 ${className ?? ""}`}
      aria-hidden
    />
  );
}

/** Placeholder collage matching the reference gift cluster composition. */
function FeaturedGiftCluster() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 w-[54%]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_65%)]" />
      <GiftPlaceholder className="absolute left-[8%] top-[38%] h-[42%] w-[38%] -rotate-[18deg]" tone="gold" />
      <GiftPlaceholder className="absolute left-[28%] top-[18%] h-[48%] w-[44%] rotate-[6deg]" tone="warm" />
      <GiftPlaceholder className="absolute right-[6%] top-[28%] h-[44%] w-[40%] rotate-[14deg]" tone="cool" />
      <GiftPlaceholder className="absolute bottom-[14%] left-[22%] h-[36%] w-[34%] -rotate-[6deg]" tone="default" />
    </div>
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
      style={{
        borderColor: theme.border,
        boxShadow: `0 0 0 1px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        background: `
          radial-gradient(ellipse 85% 75% at 78% 52%, ${theme.glow} 0%, transparent 58%),
          linear-gradient(155deg, ${theme.from} 0%, ${theme.mid} 50%, ${theme.to} 100%)
        `,
      }}
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
        {caseItem.subtitle ? (
          <p className="mt-1.5 text-[11px] leading-snug text-white/55">{caseItem.subtitle}</p>
        ) : null}
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

function CatalogPattern({ slug, color, patternId }: { slug: string; color: string; patternId: string }) {
  const stroke = color;
  let motif: ReactNode;
  switch (slug) {
    case "starter":
      motif = (
        <>
          <path d="M10 8l8 8M18 8l-8 8" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="10" cy="8" r="1.6" fill={stroke} />
          <circle cx="18" cy="8" r="1.6" fill={stroke} />
        </>
      );
      break;
    case "birthday":
      motif = <path d="M14 6c-3 3-4 6-4 9a4 4 0 008 0c0-3-1-6-4-9z" fill="none" stroke={stroke} strokeWidth="1.2" />;
      break;
    case "gold":
    case "royal":
    case "classic-cap":
      motif = (
        <path
          d="M8 12l3-4 3 2.5L17 8l1.5 4H8zm0 0v2h10.5v-2M10 14v4h6v-4"
          fill="none"
          stroke={stroke}
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      );
      break;
    case "diamond":
    case "legendary":
      motif = (
        <path d="M14 7l3 3-3 7-3-7 3-3zM11 10h6" fill="none" stroke={stroke} strokeWidth="1.15" strokeLinejoin="round" />
      );
      break;
    default:
      motif = <circle cx="14" cy="14" r="2.2" fill="none" stroke={stroke} strokeWidth="1.2" />;
  }

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
      <defs>
        <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse">
          {motif}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function CatalogCard({ caseItem }: { caseItem: CaseView }) {
  const uid = useId().replace(/:/g, "");
  const href = `${APP_ROUTES.cases}/${caseItem.slug}`;
  const accent =
    CATALOG[caseItem.slug] ||
    ({
      from: caseItem.accent_color || "#334155",
      to: "#0a0e14",
      glow: caseItem.accent_color || "#64748b",
      border: "rgba(58,69,86,0.9)",
    } as Accent);
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
