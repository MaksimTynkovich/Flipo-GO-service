"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CaseDetailPlayerPreview } from "@/components/cases/CaseDetailPlayerPreview";
import { CaseWinModal } from "@/components/cases/CaseWinModal";
import { formatCasePrice } from "@/components/cases/case-ui";
import { WheelChannelSheet } from "@/components/games/WheelChannelSheet";
import {
  ApiRequestError,
  getCase,
  getMe,
  openCase,
  type CaseLootPreview,
  type CaseOpenResult,
  type CaseView,
} from "@/lib/api";
import { mainBalanceNanoton } from "@/lib/balance";
import { PROMO_REQUIRED_CHANNEL, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { Gift } from "lucide-react";

type Phase = "idle" | "revealing" | "won";

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

  return (
    <PageShell>
      {loading && !caseItem ? (
        <div className="space-y-4">
          <div className="h-5 w-40 animate-pulse rounded-md bg-white/10" aria-hidden />
          <div className="case-detail-hero case-detail-hero--skeleton" aria-hidden>
            <div className="case-reveal__viewport case-reveal__viewport--skeleton animate-pulse" />
          </div>
          <div className="h-[3.25rem] animate-pulse rounded-[1.15rem] bg-surface" />
          <div className="case-detail__loot-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="case-loot-card case-loot-card--skeleton" aria-hidden>
                <div className="case-loot-card__frame case-loot-card__frame--skeleton" />
                <div className="case-loot-card__meta">
                  <div className="case-loot-card__skel case-loot-card__skel--name" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error && phase === "idle" ? (
        <p className="mb-3 text-sm text-red-400">{error}</p>
      ) : null}

      {caseItem && (phase === "idle" || phase === "revealing") ? (
        <CaseDetailPlayerPreview
          caseItem={caseItem}
          loot={loot}
          ctaLabel={ctaLabel()}
          ctaDisabled={dailyBlocked || opening || phase === "revealing"}
          ctaTopUp={needsTopUp && phase === "idle"}
          onCtaClick={() => void handleOpen()}
          showCatalogLink={phase === "idle"}
          revealMode={phase === "revealing" ? "spin" : "idle"}
          revealLoot={revealLoot}
          winnerId={phase === "revealing" ? result?.loot_entry.id : null}
          onRevealComplete={handleRevealComplete}
        />
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
