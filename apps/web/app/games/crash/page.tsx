"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CrashChart } from "@/components/games/CrashChart";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  cashoutCrash,
  formatTON,
  getCrashActiveBet,
  getCrashHistory,
  getCrashState,
  placeCrashBet,
  CrashHistoryEntry,
} from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { CrashRoundState, formatMultiplier } from "@/lib/crash";
import { connectGameWS } from "@/lib/ws";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

type ActiveBet = {
  id: string;
  roundId: string;
  amountNanoton: number;
};

export default function CrashPage() {
  const { user } = useAuth();
  const [state, setState] = useState<CrashRoundState | null>(null);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [amountTon, setAmountTon] = useState("0.1");
  const [liveMult, setLiveMult] = useState(1);
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  const [betting, setBetting] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [winMsg, setWinMsg] = useState<ReactNode | null>(null);
  const lastPhase = useRef<string | null>(null);

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

  useEffect(() => {
    getCrashState().then((s) => setState(s as CrashRoundState)).catch(() => {});
    loadHistory();
    loadActiveBet();
    const disconnect = connectGameWS("crash", (msg) => {
      if (msg.event === "tick") setState(msg.payload as CrashRoundState);
    });
    const poll = window.setInterval(() => {
      getCrashState()
        .then((s) => setState(s as CrashRoundState))
        .catch(() => {});
    }, 400);
    return () => {
      disconnect();
      window.clearInterval(poll);
    };
  }, [loadHistory, loadActiveBet]);

  useEffect(() => {
    if (state?.round_id) loadActiveBet();
  }, [state?.round_id, state?.phase, loadActiveBet]);

  useEffect(() => {
    if (state?.phase === "crashed" && lastPhase.current !== "crashed") {
      loadHistory();
      if (activeBet && activeBet.roundId === state.round_id) {
        setActiveBet(null);
        setWinMsg(null);
      }
    }
    if (state?.phase === "betting" && lastPhase.current === "crashed") {
      setWinMsg(null);
      setMsg(null);
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, state?.round_id, activeBet, loadHistory]);

  const canBet = state?.phase === "betting" && !betting && !activeBet;
  const canCashout =
    state?.phase === "running" &&
    !!activeBet &&
    activeBet.roundId === state.round_id &&
    !cashingOut;

  const displayMult = state?.phase === "running" ? liveMult : (state?.multiplier ?? 1);
  const potentialWin =
    activeBet && displayMult
      ? (activeBet.amountNanoton * displayMult) / 1_000_000_000
      : null;

  async function bet() {
    if (!canBet) return;
    const nanotons = Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);
    if (nanotons <= 0) {
      setMsg("Укажите сумму");
      return;
    }
    setBetting(true);
    setMsg(null);
    setWinMsg(null);
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
      setMsg("ok");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBetting(false);
    }
  }

  async function cashout() {
    if (!canCashout || !activeBet || !state) return;
    setCashingOut(true);
    setMsg(null);
    try {
      const mult = state.multiplier ?? liveMult;
      const res = (await cashoutCrash(activeBet.id, mult)) as { payout_nanoton: number };
      setWinMsg(
        <span className="inline-flex items-center gap-1">
          +{formatTON(res.payout_nanoton)}
          <TonIcon className="h-[0.85em] w-[0.85em]" />
          @ {formatMultiplier(mult)}
        </span>,
      );
      setActiveBet(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось забрать");
    } finally {
      setCashingOut(false);
    }
  }

  return (
    <PageShell flush>
      <div className="space-y-4">
        <p className="text-xs text-muted">Успей забрать до краша</p>

        <CrashChart
          state={state}
          history={history}
          balanceNanoton={user?.betting_balance}
          onLiveMultiplier={setLiveMult}
        />

        {activeBet && state?.phase === "running" && (
          <div className="rounded-xl bg-success/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  В игре
                </p>
                <p className="text-sm font-semibold">
                  <TonAmount amount={formatTON(activeBet.amountNanoton)} />
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  Выигрыш
                </p>
                <p className="text-sm font-bold tabular-nums text-success">
                  {potentialWin != null ? (
                    <TonAmount amount={potentialWin.toFixed(2)} iconClassName="text-success" />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {winMsg && (
          <div className="rounded-xl bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
            {winMsg}
          </div>
        )}

        <div className="panel space-y-3">
          <p className="section-label">Ставка</p>

          <div className="input-inset">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!canBet}
              value={amountTon}
              onChange={(e) => setAmountTon(e.target.value)}
              className="w-full bg-transparent text-center text-lg font-bold tabular-nums outline-none disabled:opacity-40"
            />
            <TonIcon variant="brand" className="h-5 w-5 shrink-0" title="TON" />
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

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              disabled={!canBet}
              onClick={bet}
              className={cn(
                "flex h-12 items-center justify-center rounded-xl text-sm font-bold text-white",
                "bg-accent",
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
                "flex h-12 items-center justify-center rounded-xl text-sm font-bold text-white",
                "bg-success",
                !canCashout && "opacity-40",
              )}
            >
              {cashingOut ? "…" : "Забрать"}
            </button>
          </div>

          {msg && msg !== "ok" && (
            <p className="text-center text-xs text-danger">{msg}</p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
