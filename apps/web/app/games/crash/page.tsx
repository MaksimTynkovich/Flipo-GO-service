"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrashChart } from "@/components/games/CrashChart";
import { CrashHistory } from "@/components/games/CrashHistory";
import { CrashRoundBets } from "@/components/games/CrashRoundBets";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import {
  cashoutCrash,
  formatTON,
  getCrashActiveBet,
  getCrashBets,
  getCrashHistory,
  getCrashState,
  placeCrashBet,
  CrashHistoryEntry,
  CrashRoundBets as CrashRoundBetsData,
} from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
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

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

type ActiveBet = {
  id: string;
  roundId: string;
  amountNanoton: number;
};

export default function CrashPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const [state, setState] = useState<CrashRoundState | null>(null);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [roundBets, setRoundBets] = useState<CrashRoundBetsData | null>(null);
  const [amountTon, setAmountTon] = useState("0.1");
  const [liveMult, setLiveMult] = useState(1);
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
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

  const loadActiveBet = useCallback(async () => {
    try {
      const bet = await getCrashActiveBet();
      if (bet?.id && bet.status === "pending") {
        setActiveBet({
          id: bet.id,
          roundId: bet.round_id,
          amountNanoton: bet.amount_nanoton,
        });
      } else {
        setActiveBet(null);
      }
    } catch {
      // ignore
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
    loadActiveBet();
    loadRoundBets();
    const disconnect = connectGameWS("crash", (msg) => {
      if (msg.event === "tick") setState(msg.payload as CrashRoundState);
      if (msg.event === "bets") setRoundBets(msg.payload as CrashRoundBetsData);
    });
    return disconnect;
  }, [loadHistory, loadActiveBet, loadRoundBets]);

  useEffect(() => {
    if (state?.round_id) loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  useEffect(() => {
    if (state?.round_id) loadActiveBet();
  }, [state?.round_id, state?.phase, loadActiveBet]);

  useEffect(() => {
    if (state?.phase === "crashed" && lastPhase.current !== "crashed") {
      loadHistory();
      if (activeBet && activeBet.roundId === state.round_id) {
        setActiveBet(null);
      }
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, state?.round_id, activeBet, loadHistory]);

  const canBet = state?.phase === "betting" && !betting && !activeBet;
  const canCashout =
    state?.phase === "running" &&
    !!activeBet &&
    activeBet.roundId === state.round_id &&
    !cashingOut;

  const displayMult =
    state?.phase === "crashed"
      ? (state.crash_point ?? state.multiplier ?? 1)
      : state?.phase === "running"
        ? liveMult
        : (state?.multiplier ?? 1);
  const cashoutMult = state?.phase === "running" ? (state.multiplier ?? liveMult) : displayMult;
  const potentialWin =
    activeBet && displayMult
      ? (activeBet.amountNanoton * displayMult) / 1_000_000_000
      : null;

  async function bet() {
    if (!canBet) {
      showToast({ variant: "error", title: crashPhaseBetMessage(state?.phase) });
      haptics.notificationOccurred("error");
      return;
    }

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

    setBetting(true);
    betAmountInput.complete();
    try {
      const res = (await placeCrashBet(nanotons, crypto.randomUUID())) as {
        id: string;
        round_id: string;
        amount_nanoton: number;
      };
      setActiveBet({
        id: res.id,
        roundId: res.round_id,
        amountNanoton: res.amount_nanoton,
      });
      haptics.notificationOccurred("success");
      loadRoundBets();
    } catch (e) {
      showToast({ variant: "error", title: formatGameBetError(e) });
      haptics.notificationOccurred("error");
    } finally {
      setBetting(false);
    }
  }

  async function cashout() {
    if (!canCashout || !activeBet || !state) {
      showToast({ variant: "error", title: crashCashoutMessage(state?.phase) });
      haptics.notificationOccurred("error");
      return;
    }

    setCashingOut(true);
    try {
      const mult = cashoutMult > 1 ? cashoutMult : (state.multiplier ?? 1);
      const res = (await cashoutCrash(activeBet.id, mult)) as { payout_nanoton: number };
      showToast({
        variant: "success",
        title: `+${formatTON(res.payout_nanoton)} TON @ ${formatMultiplier(mult)}`,
      });
      haptics.notificationOccurred("success");
      setActiveBet(null);
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
          {activeBet && state?.phase === "running" && (
            <div className="surface-inset flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="section-label">В игре</p>
                <p className="text-sm font-semibold">
                  <TonAmount amount={formatTON(activeBet.amountNanoton)} iconSize="sm" />
                </p>
              </div>
              <div className="text-right">
                <p className="section-label">Выигрыш</p>
                <p className="text-sm font-bold tabular-nums text-success">
                  {potentialWin != null ? (
                    <TonAmount
                      amount={potentialWin.toFixed(2)}
                      iconSize="sm"
                      iconClassName="text-success"
                    />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
          )}

          <p className="section-label">Ставка</p>

          <div className="input-inset py-2.5">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!canBet}
              value={amountTon}
              {...betAmountInput.bind({
                onChange: (e) => setAmountTon(e.target.value),
              })}
              className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none disabled:opacity-40"
              placeholder="0.00"
            />
            <TonIcon variant="brand" size="lg" title="TON" />
          </div>

          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!canBet}
                onClick={() => setAmountTon(v)}
                className={cn(
                  "quick-amount",
                  amountTon === v && "quick-amount-active",
                  !canBet && "opacity-40",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canBet}
              onClick={bet}
              className={cn(
                "flex h-11 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white transition-all active:scale-[0.98]",
                !canBet && "opacity-40",
              )}
            >
              {betting ? "…" : "Поставить"}
            </button>
            <button
              type="button"
              disabled={!canCashout}
              onClick={cashout}
              className={cn(
                "flex h-11 items-center justify-center rounded-xl bg-success text-sm font-bold text-white transition-all active:scale-[0.98]",
                !canCashout && "opacity-40",
              )}
            >
              {cashingOut ? "…" : "Забрать"}
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
