"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RouletteHistory } from "@/components/games/RouletteHistory";
import { RouletteRoundBets } from "@/components/games/RouletteRoundBets";
import { RouletteWheel } from "@/components/games/RouletteWheel";
import { PageShell } from "@/components/PageShell";
import { connectGameWS } from "@/lib/ws";
import {
  getRouletteBets,
  getRouletteHistory,
  getRouletteState,
  placeRouletteBet,
  RouletteHistoryEntry,
  RouletteRoundBets as RouletteRoundBetsData,
} from "@/lib/api";
import { RouletteRoundState, ROULETTE_COLOR_STYLES } from "@/lib/roulette";
import { TonIcon } from "@/components/icons/TonIcon";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

export default function RoulettePage() {
  const [state, setState] = useState<RouletteRoundState | null>(null);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [roundBets, setRoundBets] = useState<RouletteRoundBetsData | null>(null);
  const [amountTon, setAmountTon] = useState("0.1");
  const [betting, setBetting] = useState(false);
  const [betMsg, setBetMsg] = useState<string | null>(null);
  const lastPhase = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getRouletteHistory());
    } catch {
      // ignore
    }
  }, []);

  const loadRoundBets = useCallback(async () => {
    try {
      setRoundBets(await getRouletteBets());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    getRouletteState().then((s) => setState(s as RouletteRoundState)).catch(() => {});
    loadHistory();
    loadRoundBets();
    const disconnect = connectGameWS("roulette", (msg) => {
      if (msg.event === "tick") setState(msg.payload as RouletteRoundState);
      if (msg.event === "bets") setRoundBets(msg.payload as RouletteRoundBetsData);
    });
    return disconnect;
  }, [loadHistory, loadRoundBets]);

  useEffect(() => {
    loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  useEffect(() => {
    if (state?.phase === "result" && lastPhase.current !== "result") {
      loadHistory();
    }
    lastPhase.current = state?.phase ?? null;
  }, [state?.phase, loadHistory]);

  const canBet = state?.phase === "betting" && !betting;

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
      loadRoundBets();
    } catch (e) {
      setBetMsg(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBetting(false);
    }
  }

  return (
    <PageShell flush>
      <div className="flex min-h-[calc(100dvh-var(--app-header-offset)-var(--app-tabbar-offset))] flex-col gap-2.5">
        <div className="shrink-0 border-b border-border pb-2.5">
          <RouletteHistory history={history} roundNumber={state?.round_number} />
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <RouletteWheel state={state} />
        </div>

        <div className="panel shrink-0 space-y-3">
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

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("red")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-all active:scale-[0.98]",
                ROULETTE_COLOR_STYLES.red.bg,
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-semibold leading-none">×2</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-75">
                Красное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("green")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-all active:scale-[0.98]",
                ROULETTE_COLOR_STYLES.green.bg,
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-semibold leading-none">×14</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-75">
                Зелёное
              </span>
            </button>
            <button
              type="button"
              disabled={!canBet}
              onClick={() => bet("black")}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-white transition-all active:scale-[0.98]",
                ROULETTE_COLOR_STYLES.black.bg,
                !canBet && "opacity-40",
              )}
            >
              <span className="text-sm font-semibold leading-none">×2</span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-75">
                Чёрное
              </span>
            </button>
          </div>

          {betMsg && betMsg !== "ok" && (
            <p className="text-center text-xs text-danger">{betMsg}</p>
          )}

          <div className="hairline-top pt-3">
            <RouletteRoundBets data={roundBets} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
