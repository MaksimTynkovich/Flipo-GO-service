"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RouletteHistory } from "@/components/games/RouletteHistory";
import { RouletteWheel } from "@/components/games/RouletteWheel";
import { PageShell } from "@/components/PageShell";
import { connectGameWS } from "@/lib/ws";
import {
  getRouletteHistory,
  getRouletteState,
  placeRouletteBet,
  RouletteHistoryEntry,
} from "@/lib/api";
import { RouletteRoundState, isLandingPause } from "@/lib/roulette";
import { TonIcon } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

const PHASE_LABEL: Record<string, string> = {
  betting: "Приём ставок",
  spinning: "Крутим колесо",
  result: "Результат",
  waiting: "Ожидание",
};

function phaseLabel(state: RouletteRoundState | null): string {
  if (!state?.phase) return "—";
  if (isLandingPause(state)) return "Почти…";
  return PHASE_LABEL[state.phase] ?? state.phase;
}

export default function RoulettePage() {
  const [state, setState] = useState<RouletteRoundState | null>(null);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [amountTon, setAmountTon] = useState("0.1");
  const [betting, setBetting] = useState(false);
  const [betMsg, setBetMsg] = useState<string | null>(null);
  const lastPhase = useRef<string | null>(null);
  const [, setLandingTick] = useState(0);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getRouletteHistory());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    getRouletteState().then((s) => setState(s as RouletteRoundState)).catch(() => {});
    loadHistory();
    const disconnect = connectGameWS("roulette", (msg) => {
      if (msg.event === "tick") setState(msg.payload as RouletteRoundState);
    });
    return disconnect;
  }, [loadHistory]);

  useEffect(() => {
    if (state?.phase === "result" && lastPhase.current !== "result") {
      loadHistory();
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, loadHistory]);

  useEffect(() => {
    if (!state || state.phase !== "spinning") return;
    const endRaw = state.spin_ends_at || state.ends_at;
    if (!endRaw) return;
    const endMs = new Date(endRaw).getTime();
    const delay = Math.max(0, endMs - Date.now());
    const id = window.setTimeout(() => setLandingTick((n) => n + 1), delay);
    return () => window.clearTimeout(id);
  }, [state?.phase, state?.spin_ends_at, state?.ends_at, state?.round_id]);

  const canBet = state?.phase === "betting" && !betting;
  const statusLabel = phaseLabel(state);

  async function bet(color: string) {
    if (!canBet) return;
    const nanotons = Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);
    if (nanotons <= 0) {
      setBetMsg("Укажите сумму");
      return;
    }
    setBetting(true);
    setBetMsg(null);
    try {
      await placeRouletteBet(color, nanotons, crypto.randomUUID());
      setBetMsg("ok");
    } catch (e) {
      setBetMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBetting(false);
    }
  }

  return (
    <PageShell flush>
      <div className="flex min-h-[calc(100dvh-var(--app-header-offset)-var(--app-tabbar-offset))] flex-col gap-2.5">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-muted">Красное / чёрное ×2 · зелёное ×14</p>
          <span className="chip chip-accent shrink-0">{statusLabel}</span>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <RouletteWheel state={state} />
        </div>

        <div className="panel shrink-0 space-y-2.5">
          <p className="section-label">Ставка</p>

          <div className="input-inset py-2.5">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!canBet}
              value={amountTon}
              onChange={(e) => setAmountTon(e.target.value)}
              className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none disabled:opacity-40"
              placeholder="0.00"
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

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("red")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-all active:scale-[0.97]",
                "bg-danger",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-bold leading-none">×2</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-80">
                Красное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("green")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-all active:scale-[0.97]",
                "bg-success",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-bold leading-none">×14</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-80">
                Зелёное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("black")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/[0.08] text-white transition-all active:scale-[0.97]",
                "bg-surface-raised",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-bold leading-none">×2</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-80">
                Чёрное
              </span>
            </button>
          </div>

          {betMsg && betMsg !== "ok" && (
            <p className="text-center text-xs text-danger">{betMsg}</p>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border pt-2.5">
          <RouletteHistory history={history} embedded />
          <p className="text-[11px] tabular-nums text-muted">
            Раунд #{state?.round_number ?? "—"}
          </p>
        </div>
      </div>
    </PageShell>
  );
}
