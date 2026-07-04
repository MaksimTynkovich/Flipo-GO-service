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

  // Обновляем подпись «Почти…» после остановки колеса
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
      <div className="space-y-5">
        <div className="flex items-end justify-between">
          <p className="text-sm text-muted">Раунд #{state?.round_number ?? "—"}</p>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            {statusLabel}
          </span>
        </div>

        <RouletteHistory history={history} />

        <div className="flex justify-center py-1">
          <RouletteWheel state={state} />
        </div>

        <div className="space-y-3">
          <p className="section-label">Ставка</p>

          <div className="input-inset">
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
            <TonIcon variant="brand" className="h-5 w-5 shrink-0" title="TON" />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("red")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-3.5 text-white transition-all active:scale-[0.97]",
                "bg-danger",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-base font-bold">×2</span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                Красное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("green")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-3.5 text-white transition-all active:scale-[0.97]",
                "bg-success",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-base font-bold">×14</span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                Зелёное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("black")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-3.5 text-white transition-all active:scale-[0.97]",
                "bg-[#3d4450]",
                !canBet && "opacity-40",
              )}
            >
              <span className="text-base font-bold">×2</span>
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                Чёрное
              </span>
            </button>
          </div>

          {betMsg && betMsg !== "ok" && (
            <p className="text-center text-xs text-danger">{betMsg}</p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
