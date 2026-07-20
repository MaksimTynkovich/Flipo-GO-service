"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { TonIcon } from "@/components/icons/TonIcon";
import { CaseOpenReveal } from "@/components/cases/CaseOpenReveal";
import { CaseWinModal } from "@/components/cases/CaseWinModal";
import {
  formatTON,
  getCase,
  getMe,
  openCase,
  type CaseLootPreview,
  type CaseOpenResult,
  type CaseView,
} from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { Gift } from "lucide-react";

type Phase = "idle" | "revealing" | "won";

function formatCasePrice(nanoton: number): string {
  const ton = nanoton / 1e9;
  if (Number.isInteger(ton)) return String(ton);
  return ton.toFixed(1).replace(/\.0$/, "");
}

export function CaseDetailView() {
  const params = useParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const patternId = useId().replace(/:/g, "");
  const idOrSlug = String(params?.id || "");

  const [caseItem, setCaseItem] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CaseOpenResult | null>(null);
  const [revealLoot, setRevealLoot] = useState<CaseLootPreview[]>([]);

  const load = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    setError(null);
    try {
      setCaseItem(await getCase(idOrSlug));
    } catch (e) {
      setError(formatUserError(e, "Кейс не найден"));
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const accent = caseItem?.accent_color || "#3b82f6";
  const loot = caseItem?.loot || [];
  const dailyBlocked =
    caseItem?.kind === "daily" && caseItem.daily_available === false;
  const canOpen = Boolean(caseItem) && !dailyBlocked && !opening && phase === "idle";

  async function handleOpen() {
    if (!caseItem || opening || phase !== "idle") return;
    setOpening(true);
    setError(null);
    haptics.impactOccurred("medium");
    try {
      const res = await openCase(caseItem.slug);
      const pool = caseItem.loot?.length ? caseItem.loot : [res.loot_entry];
      setRevealLoot(pool);
      setResult(res);
      setPhase("revealing");
      haptics.impactOccurred("heavy");
      try {
        setUser(await getMe());
      } catch {
        /* ignore */
      }
      void load();
    } catch (e) {
      setError(formatUserError(e, "Не удалось открыть кейс"));
      haptics.notificationOccurred("error");
    } finally {
      setOpening(false);
    }
  }

  const handleRevealComplete = useCallback(() => {
    setPhase("won");
    haptics.notificationOccurred("success");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- haptic API is fire-and-forget
  }, []);

  function handleAgain() {
    setResult(null);
    setRevealLoot([]);
    setPhase("idle");
  }

  return (
    <PageShell>
      {loading && !caseItem ? (
        <div className="h-52 animate-pulse rounded-[22px] bg-surface" />
      ) : null}

      {error && phase === "idle" ? (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      ) : null}

      {caseItem && phase === "idle" ? (
        <div className="space-y-5">
          <div
            className="case-detail-hero relative overflow-hidden rounded-[22px] p-5"
            style={{
              ["--case-glow" as string]: accent,
              background: `linear-gradient(165deg, ${accent}55 0%, #0c121c 55%, #080b10 100%)`,
              boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 35%, transparent), 0 18px 40px rgba(0,0,0,0.45)`,
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
              aria-hidden
            >
              <defs>
                <pattern
                  id={`case-detail-${patternId}`}
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="4" cy="4" r="1.2" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#case-detail-${patternId})`} />
            </svg>

            <div className="relative z-[1]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {caseItem.kind === "daily"
                  ? "Ежедневный"
                  : caseItem.kind === "featured"
                    ? "Премиум"
                    : "Кейс"}
              </p>
              <h1 className="mt-1 text-[1.65rem] font-bold leading-tight tracking-tight text-white">
                {caseItem.title}
              </h1>
              {caseItem.subtitle ? (
                <p className="mt-1.5 text-sm text-white/65">{caseItem.subtitle}</p>
              ) : null}

              <div className="mt-4">
                {caseItem.kind === "daily" || caseItem.price_nanoton <= 0 ? (
                  <span className="inline-flex h-8 items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 text-[13px] font-semibold text-emerald-300">
                    {dailyBlocked ? "Уже открыт сегодня" : "Бесплатно сегодня"}
                  </span>
                ) : (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3 text-[13px] font-semibold tabular-nums text-white backdrop-blur-md">
                    <TonIcon variant="brand" className="h-4 w-4" />
                    {formatCasePrice(caseItem.price_nanoton)} TON
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-white/55">Возможные призы</h2>
            <div className="grid grid-cols-3 gap-2.5">
              {loot.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col items-center rounded-2xl bg-[#0e141c] p-2.5 ring-1 ring-inset ring-white/[0.06]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={giftImageUrl(entry.collection_slug, entry.image_url)}
                    alt={entry.display_name}
                    className="h-14 w-14 object-contain"
                  />
                  <p className="mt-1.5 line-clamp-2 text-center text-[11px] font-medium leading-snug text-white/85">
                    {entry.display_name}
                  </p>
                  {entry.rarity_label ? (
                    <span className="mt-1 text-[10px] text-white/40">{entry.rarity_label}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="case-detail-cta app-control"
            disabled={!canOpen}
            onClick={() => void handleOpen()}
          >
            {opening
              ? "Открываем…"
              : dailyBlocked
                ? "Завтра"
                : caseItem.price_nanoton > 0
                  ? `Открыть · ${formatTON(caseItem.price_nanoton)} TON`
                  : "Открыть бесплатно"}
          </button>

          <Link
            href={APP_ROUTES.cases}
            className="block text-center text-xs text-white/40 transition-colors hover:text-white/70"
          >
            К каталогу
          </Link>
        </div>
      ) : null}

      {caseItem && phase === "revealing" && result ? (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {caseItem.title}
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">Открытие</h1>
          </div>
          <CaseOpenReveal
            loot={revealLoot.length > 0 ? revealLoot : [result.loot_entry]}
            winnerId={result.loot_entry.id}
            accent={accent}
            onComplete={handleRevealComplete}
          />
        </div>
      ) : null}

      {phase === "won" && result ? (
        <CaseWinModal
          result={result}
          accent={accent}
          onAgain={handleAgain}
          onInventory={() => router.push(APP_ROUTES.inventory)}
        />
      ) : null}

      {!caseItem && !loading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted">
          <Gift className="h-8 w-8 opacity-40" />
          <p className="text-sm">Кейс не найден</p>
          <Link href={APP_ROUTES.cases} className="text-sm text-accent">
            Назад
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
