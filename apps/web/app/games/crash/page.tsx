"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrashChart } from "@/components/games/CrashChart";
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

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

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
  const [activeBets, setActiveBets] = useState<CrashActiveBet[]>([]);
  const [betting, setBetting] = useState(false);
  const [proofRoundId, setProofRoundId] = useState<string | null>(null);
  const [cashingOut, setCashingOut] = useState(false);
  const lastPhase = useRef<string | null>(null);
  const betAmountInput = useAnalyticsInput("crash_bet_amount", "crash");

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

  useEffect(() => {
    if (state?.phase === "crashed" && lastPhase.current !== "crashed") {
      loadHistory();
      setActiveBets([]);
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, loadHistory]);

  const roundActiveBets = useMemo(
    () => activeBets.filter((bet) => bet.round_id === state?.round_id),
    [activeBets, state?.round_id],
  );

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

  const displayMult =
    state?.phase === "crashed"
      ? (state.crash_point ?? state.multiplier ?? 1)
      : state?.phase === "running"
        ? liveMult
        : (state?.multiplier ?? 1);
  const cashoutMult = state?.phase === "running" ? (state.multiplier ?? liveMult) : displayMult;

  const totalStakeNanoton = roundActiveBets.reduce((sum, bet) => sum + bet.amount_nanoton, 0);
  const potentialWinTon = roundActiveBets.reduce((sum, bet) => {
    const gross = bet.amount_nanoton * cashoutMult;
    const isGift = bet.funding_type === "gift";
    const net = isGift ? gross - bet.amount_nanoton : gross;
    return sum + net;
  }, 0) / 1_000_000_000;

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

    setBetting(true);
    betAmountInput.complete();
    try {
      if (fundingMode === "gift") {
        for (const giftId of giftIds) {
          await placeCrashBet(crypto.randomUUID(), {
            mode: "gift",
            inventoryItemId: giftId,
          });
        }
        setSelectedGiftIds([]);
      } else {
        await placeCrashBet(crypto.randomUUID(), {
          mode: "balance",
          amountNanoton: Math.floor(parseFloat(amountTon || "0") * 1_000_000_000),
        });
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
      haptics.notificationOccurred("success");
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

  return (
    <PageShell flush>
      <div className="flex flex-col gap-2.5 pb-3">
        <CrashHistory
          history={history}
          onSelectRound={(entry) => entry.round_id && setProofRoundId(entry.round_id)}
        />

        <CrashChart state={state} onLiveMultiplier={setLiveMult} />

        <div className="panel space-y-3">
          {roundActiveBets.length > 0 && state?.phase === "running" && (
            <div className="surface-inset flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="section-label">В игре</p>
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
                <p className="section-label">Выигрыш</p>
                <p className="text-sm font-bold tabular-nums text-success">
                  <TonAmount
                    amount={potentialWinTon.toFixed(2)}
                    iconSize="sm"
                    iconClassName="text-success"
                  />
                </p>
              </div>
            </div>
          )}

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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canBet}
              onClick={bet}
              className={cn(
                "app-control btn-primary flex h-11 items-center justify-center rounded-xl text-sm font-bold",
                !canBet && "opacity-40",
              )}
            >
              {betting
                ? "…"
                : fundingMode === "gift" && selectedGiftIds.length > 1
                  ? `Поставить (${selectedGiftIds.length})`
                  : "Поставить"}
            </button>
            <button
              type="button"
              disabled={!canCashout}
              onClick={cashout}
              className={cn(
                "app-control flex h-11 items-center justify-center rounded-xl bg-success text-sm font-bold text-white hover:brightness-110",
                !canCashout && "opacity-40",
              )}
            >
              {cashingOut ? "…" : roundActiveBets.length > 1 ? "Забрать все" : "Забрать"}
            </button>
          </div>

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
