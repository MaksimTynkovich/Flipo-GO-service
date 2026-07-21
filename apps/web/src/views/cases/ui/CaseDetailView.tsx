"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { TonIcon } from "@/components/icons/TonIcon";
import { CaseOpenReveal } from "@/components/cases/CaseOpenReveal";
import { CaseWinModal } from "@/components/cases/CaseWinModal";
import { WheelChannelSheet } from "@/components/games/WheelChannelSheet";
import {
  ApiRequestError,
  formatTON,
  getCase,
  getMe,
  openCase,
  type CaseLootPreview,
  type CaseOpenResult,
  type CaseView,
} from "@/lib/api";
import { giftImageUrl } from "@/lib/gifts";
import { mainBalanceNanoton } from "@/lib/balance";
import { PROMO_REQUIRED_CHANNEL, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "idle" | "revealing" | "won";

function formatCasePrice(nanoton: number): string {
  const ton = nanoton / 1e9;
  if (Number.isInteger(ton)) return String(ton);
  return ton.toFixed(1).replace(/\.0$/, "");
}

function LootCard({ entry }: { entry: CaseLootPreview }) {
  const floor = entry.floor_price_nanoton ?? 0;
  return (
    <div className="case-loot-card">
      <div className="case-loot-card__frame">
        {floor > 0 ? (
          <span className="case-loot-card__price">
            {formatTON(floor)}
            <TonIcon variant="brand" className="h-3 w-3 shrink-0" />
          </span>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={giftImageUrl(entry.collection_slug, entry.image_url)}
          alt={entry.display_name}
          className="case-loot-card__img"
          draggable={false}
        />
      </div>
      <p className="case-loot-card__name">{entry.display_name}</p>
      {entry.rarity_label ? (
        <span className="case-loot-card__rarity">{entry.rarity_label}</span>
      ) : null}
    </div>
  );
}

export function CaseDetailView() {
  const params = useParams();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const haptics = useTelegramHaptics();
  const idOrSlug = String(params?.id || "");

  const [caseItem, setCaseItem] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CaseOpenResult | null>(null);
  const [revealLoot, setRevealLoot] = useState<CaseLootPreview[]>([]);
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);

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

  const accent = caseItem?.accent_color || "#3390ec";
  const loot = caseItem?.loot || [];
  const dailyBlocked =
    caseItem?.kind === "daily" && caseItem.daily_available === false;
  const isFree =
    Boolean(caseItem) &&
    (caseItem!.kind === "daily" || caseItem!.price_nanoton <= 0);
  const needsChannel =
    Boolean(caseItem?.require_channel) && caseItem?.channel_subscribed === false;
  const channel = caseItem?.required_channel || PROMO_REQUIRED_CHANNEL;
  const channelUrl = promoChannelUrl(channel);
  const balance = user ? mainBalanceNanoton(user) : 0;
  const needsTopUp =
    Boolean(caseItem) &&
    !isFree &&
    caseItem!.price_nanoton > 0 &&
    balance < caseItem!.price_nanoton;

  async function runOpen(fresh: CaseView) {
    setOpening(true);
    setError(null);
    haptics.impactOccurred("medium");
    try {
      const res = await openCase(fresh.slug);
      const pool = fresh.loot?.length ? fresh.loot : [res.loot_entry];
      setRevealLoot(pool);
      setResult(res);
      setPhase("revealing");
      setChannelSheetOpen(false);
      haptics.impactOccurred("heavy");
      try {
        setUser(await getMe());
      } catch {
        /* ignore */
      }
      void load();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "channel_not_subscribed") {
        setChannelSheetOpen(true);
        setError(null);
        void load();
      } else if (e instanceof ApiRequestError && e.code === "insufficient_funds") {
        setError(null);
        router.push(APP_ROUTES.deposit);
      } else {
        setError(formatUserError(e, "Не удалось открыть кейс"));
        haptics.notificationOccurred("error");
      }
    } finally {
      setOpening(false);
    }
  }

  async function handleOpen() {
    if (!caseItem || opening || phase !== "idle") return;

    if (needsTopUp) {
      router.push(APP_ROUTES.deposit);
      return;
    }

    if (caseItem.require_channel && caseItem.channel_subscribed === false) {
      setChannelSheetOpen(true);
      return;
    }

    await runOpen(caseItem);
  }

  async function recheckChannelAndOpen() {
    setChannelSheetOpen(false);
    try {
      const fresh = await getCase(idOrSlug);
      setCaseItem(fresh);
      if (fresh.require_channel && fresh.channel_subscribed === false) {
        setChannelSheetOpen(true);
        setError("Подписка не найдена — подпишитесь и нажмите снова");
        return;
      }
      await runOpen(fresh);
    } catch (e) {
      setError(formatUserError(e, "Не удалось проверить подписку"));
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

  function ctaLabel(): string {
    if (opening || phase === "revealing") return "Открываем…";
    if (dailyBlocked) return "Завтра";
    if (needsTopUp) return "Пополнить баланс";
    if (needsChannel) return "Подписаться и открыть";
    if (caseItem && caseItem.price_nanoton > 0) {
      return `Открыть · ${formatCasePrice(caseItem.price_nanoton)} TON`;
    }
    return "Открыть бесплатно";
  }

  const heading =
    caseItem && !caseItem.title.toLowerCase().includes("кейс")
      ? `${caseItem.title} Кейс`
      : caseItem?.title || "";

  return (
    <PageShell>
      {loading && !caseItem ? (
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
          <div className="h-[7.5rem] animate-pulse rounded-[1.35rem] bg-surface" />
          <div className="h-[3.25rem] animate-pulse rounded-[1.15rem] bg-surface" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        </div>
      ) : null}

      {error && phase === "idle" ? (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      ) : null}

      {caseItem && (phase === "idle" || phase === "revealing") ? (
        <div className="case-detail space-y-4">
          <h1 className="case-detail__title">{heading}</h1>

          <CaseOpenReveal
            loot={
              phase === "revealing" && revealLoot.length > 0
                ? revealLoot
                : loot
            }
            winnerId={phase === "revealing" ? result?.loot_entry.id : null}
            mode={phase === "revealing" ? "spin" : "idle"}
            accent={accent}
            onComplete={handleRevealComplete}
          />

          <button
            type="button"
            className={cn(
              "case-detail-cta app-control",
              needsTopUp && phase === "idle" && "case-detail-cta--topup",
            )}
            disabled={dailyBlocked || opening || phase === "revealing"}
            onClick={() => void handleOpen()}
          >
            {needsTopUp && phase === "idle" ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M19 7V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v1" />
                  <path d="M3 11v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
                  <path d="M16 14h.01" />
                </svg>
                {ctaLabel()}
              </span>
            ) : (
              ctaLabel()
            )}
          </button>

          <section className="case-detail__collections">
            <div className="case-detail__collections-head">
              <Package className="h-4 w-4 text-accent" strokeWidth={2.2} aria-hidden />
              <h2>Коллекции в этом кейсе</h2>
            </div>
            {loot.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface py-10 text-muted">
                <Gift className="h-7 w-7 opacity-40" />
                <p className="text-sm">Призы скоро появятся</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {loot.map((entry) => (
                  <LootCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </section>

          {phase === "idle" ? (
            <Link
              href={APP_ROUTES.cases}
              className="block pb-1 text-center text-xs text-white/40 transition-colors hover:text-white/70"
            >
              К каталогу
            </Link>
          ) : null}
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

      {channelSheetOpen ? (
        <WheelChannelSheet
          channel={channel}
          channelUrl={channelUrl}
          description="Чтобы открыть этот кейс, подпишитесь на наш канал"
          onClose={() => {
            setChannelSheetOpen(false);
            void load();
          }}
          onOpenChannel={() => {
            if (channelUrl) openTelegramLink(channelUrl);
            window.setTimeout(() => {
              void recheckChannelAndOpen();
            }, 1200);
          }}
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
