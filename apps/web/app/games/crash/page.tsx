"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrashAutoCashout } from "@/components/games/CrashAutoCashout";
import { CrashChart, type CrashStageFx } from "@/components/games/CrashChart";
import { CrashHistory } from "@/components/games/CrashHistory";
import { CrashRoundBets } from "@/components/games/CrashRoundBets";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { GiftStakeIcons } from "@/components/games/BetStakeLabel";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  cashoutCrash,
  formatTON,
  getCrashActiveBets,
  getCrashBets,
  getCrashHistory,
  getCrashState,
  placeCrashBet,
  CrashHistoryEntry,
  CrashRoundBets as CrashRoundBetsData,
  CrashActiveBet,
} from "@/lib/api";
import { TonAmount } from "@/components/icons/TonIcon";
import { CrashRoundState, formatMultiplier } from "@/lib/crash";
import {
  crashCashoutMessage,
  crashPhaseBetMessage,
  formatGameBetError,
} from "@/lib/game-errors";
import { connectGameWS } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { useAnalyticsInput } from "@/lib/useAnalyticsInput";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { BetFundingMode } from "@/lib/bet-funding";
import { crashBetClosedLabel } from "@/lib/bet-cta";
import { useCountdownSeconds } from "@/src/shared/hooks/useCountdownSeconds";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];
const AUTO_STORAGE_KEY = "flipo.crash.autoCashout";

function loadAutoSettings(): { enabled: boolean; target: string } {
  if (typeof window === "undefined") return { enabled: false, target: "2" };
  try {
    const raw = window.localStorage.getItem(AUTO_STORAGE_KEY);
    if (!raw) return { enabled: false, target: "2" };
    const parsed = JSON.parse(raw) as { enabled?: boolean; target?: string };
    return {
      enabled: !!parsed.enabled,
      target: parsed.target && Number(parsed.target) >= 1.01 ? parsed.target : "2",
    };
  } catch {
    return { enabled: false, target: "2" };
  }
}

export default function CrashPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const [state, setState] = useState<CrashRoundState | null>(null);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [roundBets, setRoundBets] = useState<CrashRoundBetsData | null>(null);
  const [amountTon, setAmountTon] = useState("0.1");
  const [fundingMode, setFundingMode] = useState<BetFundingMode>("balance");
  const [selectedGiftIds, setSelectedGiftIds] = useState<string[]>([]);
  const [liveMult, setLiveMult] = useState(1);
  const liveMultRef = useRef(1);
  const [activeBets, setActiveBets] = useState<CrashActiveBet[]>([]);
  const [betting, setBetting] = useState(false);
  const [proofRoundId, setProofRoundId] = useState<string | null>(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTarget, setAutoTarget] = useState("2");
  const [stageFx, setStageFx] = useState<CrashStageFx>(null);
  const lastPhase = useRef<string | null>(null);
  const autoFiredRef = useRef<Set<string>>(new Set());
  const hadStakeRef = useRef(false);
  const fxTimerRef = useRef<number | null>(null);
  const betAmountInput = useAnalyticsInput("crash_bet_amount", "crash");

  function triggerStageFx(next: NonNullable<CrashStageFx>, ms = 1600) {
    if (fxTimerRef.current != null) window.clearTimeout(fxTimerRef.current);
    setStageFx(next);
    fxTimerRef.current = window.setTimeout(() => {
      setStageFx(null);
      fxTimerRef.current = null;
    }, ms);
  }

  useEffect(() => {
    const saved = loadAutoSettings();
    setAutoEnabled(saved.enabled);
    setAutoTarget(saved.target);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AUTO_STORAGE_KEY,
        JSON.stringify({ enabled: autoEnabled, target: autoTarget }),
      );
    } catch {
      // ignore
    }
  }, [autoEnabled, autoTarget]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getCrashHistory());
    } catch {
      // ignore
    }
  }, []);

  const loadActiveBets = useCallback(async () => {
    try {
      const bets = await getCrashActiveBets();
      setActiveBets(bets.filter((bet) => bet.status === "pending"));
    } catch {
      setActiveBets([]);
    }
  }, []);

  const loadRoundBets = useCallback(async () => {
    try {
      setRoundBets(await getCrashBets());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    getCrashState().then((s) => setState(s as CrashRoundState)).catch(() => {});
    loadHistory();
    loadActiveBets();
    loadRoundBets();
    const disconnect = connectGameWS("crash", (msg) => {
      if (msg.event === "tick") setState(msg.payload as CrashRoundState);
      if (msg.event === "bets") setRoundBets(msg.payload as CrashRoundBetsData);
    });
    return disconnect;
  }, [loadHistory, loadActiveBets, loadRoundBets]);

  useEffect(() => {
    if (state?.round_id) loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  useEffect(() => {
    if (state?.round_id) loadActiveBets();
  }, [state?.round_id, state?.phase, loadActiveBets]);

  const roundActiveBets = useMemo(
    () => activeBets.filter((bet) => bet.round_id === state?.round_id),
    [activeBets, state?.round_id],
  );

  useEffect(() => {
    if (roundActiveBets.length > 0) {
      hadStakeRef.current = true;
    }
  }, [roundActiveBets.length]);

  useEffect(() => {
    if (state?.phase === "crashed" && lastPhase.current !== "crashed") {
      loadHistory();
      if (hadStakeRef.current) {
        const crashMult = state.crash_point ?? state.multiplier ?? 1;
        triggerStageFx({ kind: "lose", multiplier: crashMult }, 1800);
        haptics.notificationOccurred("error");
      } else {
        haptics.impactOccurred("medium");
      }
      setActiveBets([]);
      autoFiredRef.current.clear();
      hadStakeRef.current = false;
    }
    if (state?.phase === "running" && lastPhase.current !== "running") {
      autoFiredRef.current.clear();
    }
    if (state?.phase === "betting" && lastPhase.current !== "betting") {
      hadStakeRef.current = false;
      setStageFx(null);
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, state?.crash_point, state?.multiplier, loadHistory, haptics]);

  useEffect(() => {
    return () => {
      if (fxTimerRef.current != null) window.clearTimeout(fxTimerRef.current);
    };
  }, []);

  const excludedGiftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bet of roundBets?.bets ?? []) {
      if (bet.user_id === user?.id && bet.gift?.id) {
        ids.add(bet.gift.id);
      }
    }
    for (const bet of roundActiveBets) {
      if (bet.inventory_item_id) ids.add(bet.inventory_item_id);
    }
    return Array.from(ids);
  }, [roundBets?.bets, roundActiveBets, user?.id]);

  const activeGiftIcons = useMemo(() => {
    return (roundBets?.bets ?? [])
      .filter((bet) => bet.user_id === user?.id && bet.status === "pending" && bet.gift)
      .map((bet) => bet.gift!);
  }, [roundBets?.bets, user?.id]);

  const canBet = state?.phase === "betting" && !betting;
  const canCashout =
    state?.phase === "running" &&
    roundActiveBets.length > 0 &&
    !cashingOut;

  const waitSeconds = useCountdownSeconds(
    state?.ends_at,
    state?.phase === "waiting" || state?.phase === "crashed",
  );

  const betButtonLabel = (() => {
    if (betting) return "…";
    if (canBet) {
      return fundingMode === "gift" && selectedGiftIds.length > 1
        ? `Поставить (${selectedGiftIds.length})`
        : "Поставить";
    }
    const base = crashBetClosedLabel(state?.phase);
    if (waitSeconds > 0 && (state?.phase === "waiting" || state?.phase === "crashed")) {
      return `${base} · ${String(waitSeconds).padStart(2, "0")}`;
    }
    return base;
  })();

  const displayMult =
    state?.phase === "crashed"
      ? (state.crash_point ?? state.multiplier ?? 1)
      : state?.phase === "running"
        ? liveMult
        : (state?.multiplier ?? 1);
  const cashoutMult = state?.phase === "running" ? (state.multiplier ?? liveMult) : displayMult;

  const totalStakeNanoton = roundActiveBets.reduce((sum, bet) => sum + bet.amount_nanoton, 0);
  const potentialWinTon =
    roundActiveBets.reduce((sum, bet) => {
      const gross = bet.amount_nanoton * cashoutMult;
      const isGift = bet.funding_type === "gift";
      const net = isGift ? gross - bet.amount_nanoton : gross;
      return sum + net;
    }, 0) / 1_000_000_000;

  const parsedAutoTarget = Number.parseFloat(autoTarget);
  const autoCashoutValue =
    autoEnabled && Number.isFinite(parsedAutoTarget) && parsedAutoTarget >= 1.01
      ? Math.floor(parsedAutoTarget * 100) / 100
      : null;

  async function bet() {
    if (!canBet) {
      showToast({ variant: "error", title: crashPhaseBetMessage(state?.phase) });
      haptics.notificationOccurred("error");
      return;
    }

    const giftIds =
      fundingMode === "gift" ? selectedGiftIds.filter((id) => !excludedGiftIds.includes(id)) : [];

    if (fundingMode === "gift") {
      if (giftIds.length === 0) {
        showToast({ variant: "error", title: "Выберите подарок для ставки." });
        haptics.notificationOccurred("error");
        return;
      }
    } else {
      const nanotons = Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);
      if (nanotons <= 0) {
        showToast({ variant: "error", title: "Укажите корректную сумму ставки." });
        haptics.notificationOccurred("error");
        return;
      }
      if (user && user.betting_balance < nanotons) {
        showToast({ variant: "error", title: "Недостаточно средств на балансе." });
        haptics.notificationOccurred("error");
        return;
      }
    }

    if (autoEnabled && autoCashoutValue == null) {
      showToast({ variant: "error", title: "Укажите множитель автовывода ≥ 1.01" });
      haptics.notificationOccurred("error");
      return;
    }

    setBetting(true);
    betAmountInput.complete();
    try {
      const options = { autoCashoutMultiplier: autoCashoutValue };
      if (fundingMode === "gift") {
        for (const giftId of giftIds) {
          await placeCrashBet(
            crypto.randomUUID(),
            { mode: "gift", inventoryItemId: giftId },
            options,
          );
        }
        setSelectedGiftIds([]);
      } else {
        await placeCrashBet(
          crypto.randomUUID(),
          {
            mode: "balance",
            amountNanoton: Math.floor(parseFloat(amountTon || "0") * 1_000_000_000),
          },
          options,
        );
      }
      haptics.notificationOccurred("success");
      await loadActiveBets();
      loadRoundBets();
    } catch (e) {
      showToast({ variant: "error", title: formatGameBetError(e) });
      haptics.notificationOccurred("error");
    } finally {
      setBetting(false);
    }
  }

  async function cashout() {
    if (!canCashout || !state) {
      showToast({ variant: "error", title: crashCashoutMessage(state?.phase) });
      haptics.notificationOccurred("error");
      return;
    }

    setCashingOut(true);
    try {
      const mult = cashoutMult > 1 ? cashoutMult : (state.multiplier ?? 1);
      let totalPayout = 0;
      for (const bet of roundActiveBets) {
        const res = (await cashoutCrash(bet.id, mult)) as { payout_nanoton: number };
        totalPayout += res.payout_nanoton;
      }
      showToast({
        variant: "success",
        title: `+${formatTON(totalPayout)} TON @ ${formatMultiplier(mult)}`,
      });
      triggerStageFx(
        {
          kind: "win",
          amountTon: formatTON(totalPayout),
          multiplier: mult,
        },
        1700,
      );
      haptics.notificationOccurred("success");
      hadStakeRef.current = false;
      setActiveBets([]);
      loadRoundBets();
    } catch (e) {
      showToast({
        variant: "error",
        title: e instanceof Error ? e.message : crashCashoutMessage(state?.phase),
      });
      haptics.notificationOccurred("error");
    } finally {
      setCashingOut(false);
    }
  }

  const roundActiveBetsRef = useRef(roundActiveBets);
  roundActiveBetsRef.current = roundActiveBets;
  const cashingOutRef = useRef(cashingOut);
  cashingOutRef.current = cashingOut;
  const phaseRef = useRef(state?.phase);
  phaseRef.current = state?.phase;

  const tryClientAutoCashout = useCallback(
    async (live: number) => {
      if (phaseRef.current !== "running" || cashingOutRef.current) return;
      const pending = roundActiveBetsRef.current;
      if (pending.length === 0) return;

      const due = pending.filter((bet) => {
        const target = bet.auto_cashout_multiplier;
        if (target == null || live < target) return false;
        if (autoFiredRef.current.has(bet.id)) return false;
        return true;
      });
      if (due.length === 0) return;

      for (const bet of due) autoFiredRef.current.add(bet.id);

      try {
        let totalPayout = 0;
        let lastMult = live;
        for (const bet of due) {
          const target = bet.auto_cashout_multiplier ?? live;
          lastMult = target;
          const res = (await cashoutCrash(bet.id, target)) as { payout_nanoton: number };
          totalPayout += res.payout_nanoton;
        }
        if (totalPayout > 0) {
          showToast({
            variant: "success",
            title: `Автовывод +${formatTON(totalPayout)} TON @ ${formatMultiplier(lastMult)}`,
          });
          triggerStageFx(
            {
              kind: "win",
              amountTon: formatTON(totalPayout),
              multiplier: lastMult,
            },
            1700,
          );
          haptics.notificationOccurred("success");
          hadStakeRef.current = false;
        }
        await loadActiveBets();
        loadRoundBets();
      } catch {
        for (const bet of due) autoFiredRef.current.delete(bet.id);
      }
    },
    [showToast, haptics, loadActiveBets, loadRoundBets],
  );

  const onLiveMultiplier = useCallback(
    (mult: number) => {
      liveMultRef.current = mult;
      setLiveMult(mult);
      void tryClientAutoCashout(mult);
    },
    [tryClientAutoCashout],
  );

  const primaryDisabled = betting || cashingOut || (!canCashout && !canBet);
  const primaryAction = canCashout ? cashout : bet;
  const primaryLabel = (() => {
    if (cashingOut || betting) return "…";
    if (canCashout) {
      const win = potentialWinTon.toFixed(2);
      return roundActiveBets.length > 1 ? `Забрать все · ${win}` : `Забрать · ${win}`;
    }
    if (canBet) {
      return fundingMode === "gift" && selectedGiftIds.length > 1
        ? `Поставить (${selectedGiftIds.length})`
        : "Поставить";
    }
    if (state?.phase === "running") return "Нет ставки";
    return betButtonLabel;
  })();

  return (
    <PageShell flush>
      <div className="flex flex-col gap-2.5 pb-3">
        <CrashHistory
          history={history}
          onSelectRound={(entry) => entry.round_id && setProofRoundId(entry.round_id)}
        />

        <CrashChart
          state={state}
          fx={stageFx}
          onLiveMultiplier={onLiveMultiplier}
          onMilestone={(m) => {
            if (m >= 10) haptics.notificationOccurred("success");
            else if (m >= 5) haptics.impactOccurred("medium");
            else haptics.impactOccurred("light");
          }}
        />

        <div className="panel space-y-3">
          {roundActiveBets.length > 0 && state?.phase === "running" ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-success/10 px-3 py-2.5">
              <div>
                <p className="section-label text-success/80">В игре</p>
                <p className="text-sm font-semibold">
                  {activeGiftIcons.length > 0 ? (
                    <GiftStakeIcons
                      gifts={activeGiftIcons}
                      size="sm"
                      amountNanoton={totalStakeNanoton}
                    />
                  ) : (
                    <TonAmount amount={formatTON(totalStakeNanoton)} iconSize="sm" />
                  )}
                  {roundActiveBets.length > 1 && (
                    <span className="ml-1.5 text-xs text-muted">×{roundActiveBets.length}</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="section-label text-success/80">Сейчас</p>
                <p className="text-sm font-bold tabular-nums text-success">
                  <TonAmount
                    amount={potentialWinTon.toFixed(2)}
                    iconSize="sm"
                    iconClassName="text-success"
                  />
                </p>
              </div>
            </div>
          ) : null}

          <BetFundingControl
            mode={fundingMode}
            onModeChange={setFundingMode}
            amountTon={amountTon}
            onAmountTonChange={setAmountTon}
            selectedGiftIds={selectedGiftIds}
            onSelectGifts={setSelectedGiftIds}
            excludedGiftIds={excludedGiftIds}
            disabled={!canBet}
            quickAmounts={QUICK_AMOUNTS}
            amountInputProps={betAmountInput.bind({
              onChange: (e) => setAmountTon(e.target.value),
            })}
          />

          <CrashAutoCashout
            enabled={autoEnabled}
            onEnabledChange={setAutoEnabled}
            target={autoTarget}
            onTargetChange={setAutoTarget}
            disabled={betting || cashingOut}
          />

          <button
            type="button"
            disabled={primaryDisabled}
            onClick={primaryAction}
            className={cn(
              "app-control flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-bold transition-[background-color,color,opacity,transform] duration-200",
              canCashout
                ? "crash-cashout-btn bg-success text-white hover:brightness-110 active:scale-[0.99]"
                : canBet
                  ? "btn-primary active:scale-[0.99]"
                  : "bg-surface-raised text-muted",
            )}
          >
            {primaryLabel}
          </button>

          <div className="hairline-top pt-3">
            <CrashRoundBets data={roundBets} />
          </div>
        </div>
      </div>

      {proofRoundId ? (
        <ProofModal
          roundId={proofRoundId}
          gameType="crash"
          title="Проверка Crash"
          onClose={() => setProofRoundId(null)}
        />
      ) : null}
    </PageShell>
  );
}
