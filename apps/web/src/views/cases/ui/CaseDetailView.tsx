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
  liquidateItem,
  openCase,
  type CaseLootPreview,
  type CaseOpenResult,
  type CaseView,
} from "@/lib/api";
import { patchUserBalance } from "@/lib/apply-balance";
import { mainBalanceNanoton } from "@/lib/balance";
import { PROMO_REQUIRED_CHANNEL, promoChannelUrl } from "@/lib/promo-channel";
import { APP_ROUTES } from "@/src/shared/config/navigation";
import { formatUserError } from "@/lib/user-errors";
import { useAuth } from "@/components/providers/AuthProvider";
import { useCasesFeatures } from "@/components/providers/CasesFeaturesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { openTelegramLink } from "@/src/shared/lib/twa";
import { Gift } from "lucide-react";

type Phase = "idle" | "revealing" | "won";

function msUntil(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CaseDetailView() {
  const params = useParams();
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { casesEnabled, ready: featuresReady } = useCasesFeatures();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const idOrSlug = String(params?.id || "");

  const [caseItem, setCaseItem] = useState<CaseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CaseOpenResult | null>(null);
  const [revealLoot, setRevealLoot] = useState<CaseLootPreview[]>([]);
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [cooldownMs, setCooldownMs] = useState(0);

  const notifyError = useCallback(
    (message: string) => {
      showToast({ variant: "error", title: message });
      haptics.notificationOccurred("error");
    },
    // haptics object is recreated each render; API is fire-and-forget
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast],
  );

  useEffect(() => {
    if (!featuresReady) return;
    if (!casesEnabled) {
      router.replace(APP_ROUTES.games);
    }
  }, [featuresReady, casesEnabled, router]);

  const load = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    try {
      setCaseItem(await getCase(idOrSlug));
    } catch (e) {
      notifyError(formatUserError(e, "Кейс не найден"));
    } finally {
      setLoading(false);
    }
  }, [idOrSlug, notifyError]);

  useEffect(() => {
    if (!featuresReady || !casesEnabled) return;
    void load();
  }, [load, featuresReady, casesEnabled]);

  useEffect(() => {
    const iso = caseItem?.next_available_at;
    if (!iso || caseItem?.daily_available !== false) {
      setCooldownMs(0);
      return;
    }
    let reloaded = false;
    const tick = () => {
      const left = msUntil(iso);
      setCooldownMs(left);
      if (left <= 0 && !reloaded) {
        reloaded = true;
        void load();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [caseItem?.next_available_at, caseItem?.daily_available, load]);

  const accent = caseItem?.accent_color || "#3390ec";
  const loot = caseItem?.loot || [];
  const isPromo = caseItem?.kind === "promo";
  const cooldownBlocked = caseItem?.daily_available === false;
  const isFree =
    Boolean(caseItem) &&
    (caseItem!.kind === "daily" ||
      caseItem!.kind === "promo" ||
      caseItem!.price_nanoton <= 0);
  const needsChannel =
    Boolean(caseItem?.require_channel) && caseItem?.channel_subscribed === false;
  const channel = caseItem?.required_channel || PROMO_REQUIRED_CHANNEL;
  const channelUrl = promoChannelUrl(channel);
  const balance = user ? mainBalanceNanoton(user) : 0;
  const needsTopUp =
    Boolean(caseItem) &&
    !isFree &&
    !isPromo &&
    caseItem!.price_nanoton > 0 &&
    balance < caseItem!.price_nanoton;

  async function runOpen(fresh: CaseView) {
    setOpening(true);
    haptics.impactOccurred("medium");
    try {
      const res = await openCase(fresh.slug, {
        promoCode: fresh.kind === "promo" ? promoCode : undefined,
      });
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
        void load();
      } else if (e instanceof ApiRequestError && e.code === "insufficient_funds") {
        notifyError(formatUserError(e, "Недостаточно средств"));
        router.push(APP_ROUTES.deposit);
      } else if (
        e instanceof ApiRequestError &&
        (e.code === "case_cooldown" || e.code === "case_daily_used")
      ) {
        notifyError(formatUserError(e, "Кейс пока недоступен"));
        void load();
      } else {
        notifyError(formatUserError(e, "Не удалось открыть кейс"));
      }
    } finally {
      setOpening(false);
    }
  }

  async function handleOpen() {
    if (!caseItem || opening || phase !== "idle" || cooldownBlocked) return;

    if (needsTopUp) {
      notifyError("Недостаточно средств");
      router.push(APP_ROUTES.deposit);
      return;
    }

    if (caseItem.kind === "promo" && !promoCode.trim()) {
      notifyError("Введите промокод");
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
        notifyError("Подписка не найдена — подпишитесь и нажмите снова");
        return;
      }
      await runOpen(fresh);
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось проверить подписку"));
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

  async function handleSellPrize() {
    const itemId = result?.item?.id;
    if (!itemId) return;
    try {
      const { balance } = await liquidateItem(itemId);
      setUser((prev) => (prev ? patchUserBalance(prev, { betting_balance: balance }) : prev));
      haptics.notificationOccurred("success");
    } catch (e) {
      notifyError(formatUserError(e, "Не удалось продать подарок"));
      throw e;
    }
  }

  function ctaLabel(): string {
    if (opening || phase === "revealing") return "Открываем…";
    if (cooldownBlocked) {
      return cooldownMs > 0 ? formatCountdown(cooldownMs) : "00:00:00";
    }
    if (needsChannel) return "Подписаться и открыть";
    if (isPromo) return "Открыть по промокоду";
    if (caseItem && caseItem.price_nanoton > 0) {
      return `Открыть · ${formatCasePrice(caseItem.price_nanoton)} TON`;
    }
    return "Открыть бесплатно";
  }

  if (!featuresReady || !casesEnabled) {
    return null;
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

      {caseItem && (phase === "idle" || phase === "revealing") ? (
        <CaseDetailPlayerPreview
          caseItem={caseItem}
          loot={loot}
          ctaLabel={ctaLabel()}
          ctaDisabled={
            cooldownBlocked ||
            opening ||
            phase === "revealing" ||
            (isPromo && !promoCode.trim())
          }
          onCtaClick={() => void handleOpen()}
          showCatalogLink={phase === "idle"}
          showPromoCodeInput={isPromo && phase === "idle"}
          promoCode={promoCode}
          onPromoCodeChange={setPromoCode}
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
          onSell={handleSellPrize}
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
