"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrashChart } from "@/components/games/CrashChart";
import { CrashHistory } from "@/components/games/CrashHistory";
import { PageShell } from "@/components/PageShell";
import {
  cashoutCrash,
  formatTON,
  getCrashActiveBet,
  getCrashHistory,
  getCrashState,
  placeCrashBet,
  CrashHistoryEntry,
} from "@/lib/api";
import { CrashRoundState, formatMultiplier, phaseLabel } from "@/lib/crash";
import { connectGameWS } from "@/lib/ws";
import { cn } from "@/lib/utils";

type ActiveBet = {
  id: string;
  roundId: string;
  amountNanoton: number;
};

export default function CrashPage() {
  const [state, setState] = useState<CrashRoundState | null>(null);
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const [amountTon, setAmountTon] = useState("0.1");
  const [activeBet, setActiveBet] = useState<ActiveBet | null>(null);
  const [betting, setBetting] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [winMsg, setWinMsg] = useState<string | null>(null);
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
    if (state?.round_id) {
      loadActiveBet();
    }
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

  const potentialWin =
    activeBet && state?.multiplier
      ? (activeBet.amountNanoton * state.multiplier) / 1_000_000_000
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
      const res = (await cashoutCrash(activeBet.id, state.multiplier)) as {
        payout_nanoton: number;
      };
      setWinMsg(`+${formatTON(res.payout_nanoton)} TON @ ${formatMultiplier(state.multiplier)}`);
      setActiveBet(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось забрать");
    } finally {
      setCashingOut(false);
    }
  }

  return (
    <PageShell flush>
      <div className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold">Crash</h1>
            <p className="text-sm text-muted">Раунд #{state?.round_number ?? "—"}</p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              state?.phase === "running"
                ? "bg-success/15 text-success"
                : state?.phase === "crashed"
                  ? "bg-danger/15 text-danger"
                  : "bg-accent/15 text-accent",
            )}
          >
            {phaseLabel(state?.phase)}
          </span>
        </div>

        <CrashHistory history={history} />

        <CrashChart state={state} />

        {activeBet && state?.phase === "running" && (
          <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center">
            <p className="text-xs text-muted">Ваша ставка в игре</p>
            <p className="mt-0.5 text-sm font-semibold text-success">
              {formatTON(activeBet.amountNanoton)} TON →{" "}
              {potentialWin != null ? `${potentialWin.toFixed(4)} TON` : "—"}
            </p>
          </div>
        )}

        {winMsg && (
          <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center text-sm font-semibold text-success">
            {winMsg}
          </div>
        )}

        <div className="space-y-3">
          <p className="section-label">Ставка</p>

          <div className="flex items-center rounded-xl border border-border bg-surface-raised px-4 py-3">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!canBet}
              value={amountTon}
              onChange={(e) => setAmountTon(e.target.value)}
              className="w-full bg-transparent text-center text-base font-semibold tabular-nums text-foreground outline-none disabled:opacity-40"
              placeholder="0.00"
            />
            <span className="shrink-0 text-sm font-medium text-muted">TON</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!canBet}
              onClick={bet}
              className={cn(
                "rounded-xl py-3.5 text-sm font-bold text-[#1a1f26] transition-all active:scale-[0.97]",
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
                "rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.97]",
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
