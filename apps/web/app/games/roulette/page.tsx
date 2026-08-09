"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { RouletteHistory } from "@/components/games/RouletteHistory";
import { RouletteRoundBets } from "@/components/games/RouletteRoundBets";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { GameModeGate } from "@/components/games/GameModeGate";
import { RouletteWheel } from "@/components/games/RouletteWheel";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAcceptBets } from "@/components/providers/MaintenanceGate";
import { useToast } from "@/components/providers/ToastProvider";
import { connectGameWS } from "@/lib/ws";
import {
  getRouletteBets,
  getRouletteHistory,
  getRouletteState,
  placeRouletteBet,
  RouletteHistoryEntry,
  RouletteRoundBets as RouletteRoundBetsData,
} from "@/lib/api";
import { formatGameBetError, roulettePhaseBetMessage } from "@/lib/game-errors";
import { emitBalanceWin } from "@/lib/balance-win";
import {
  numberColor,
  RESULT_DISPLAY_MS,
  RouletteColor,
  RouletteRoundState,
  rouletteWinCreditNanoton,
} from "@/lib/roulette";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { useAnalyticsInput } from "@/lib/useAnalyticsInput";
import { notifyBettableGiftsChanged } from "@/components/games/useBettableGifts";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

function rouletteStateEqual(
  a: RouletteRoundState | null,
  b: RouletteRoundState | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.round_id === b.round_id &&
    a.phase === b.phase &&
    a.ends_at === b.ends_at &&
    a.spin_ends_at === b.spin_ends_at &&
    a.result_number === b.result_number &&
    a.result === b.result &&
    a.result_index === b.result_index &&
    a.round_number === b.round_number &&
    a.server_seed_hash === b.server_seed_hash
  );
}

export default function RoulettePage() {
  return (
    <GameModeGate mode="roulette">
      <RoulettePageContent />
    </GameModeGate>
  );
}

function RoulettePageContent() {
  const { user } = useAuth();
  const acceptBets = useAcceptBets();
  const { showToast } = useToast();
  const haptics = useTelegramHaptics();
  const [state, setState] = useState<RouletteRoundState | null>(null);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [roundBets, setRoundBets] = useState<RouletteRoundBetsData | null>(null);
  const [amountTon, setAmountTon] = useState("0.1");
  const [selectedGiftIds, setSelectedGiftIds] = useState<string[]>([]);
  const [betting, setBetting] = useState(false);
  const [proofRoundId, setProofRoundId] = useState<string | null>(null);
  const lastPhase = useRef<string | null>(null);
  const betAmountInput = useAnalyticsInput("roulette_bet_amount", "roulette");

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
    const refreshState = () => {
      getRouletteState()
        .then((s) => setState(s as RouletteRoundState))
        .catch(() => {});
    };
    const resync = () => {
      refreshState();
      loadRoundBets();
    };

    resync();
    loadHistory();
    const disconnect = connectGameWS(
      "roulette",
      (msg) => {
        if (msg.event === "tick") {
          const next = msg.payload as RouletteRoundState;
          setState((prev) => (rouletteStateEqual(prev, next) ? prev : next));
        }
        if (msg.event === "bets") {
          const payload = msg.payload as RouletteRoundBetsData | null;
          if (payload && typeof payload === "object") {
            setRoundBets(payload);
          }
        }
      },
      { onOpen: resync },
    );
    return disconnect;
  }, [loadHistory, loadRoundBets]);

  useEffect(() => {
    if (state?.round_id) loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  useEffect(() => {
    if (!state?.phase) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = () => {
      getRouletteState()
        .then((s) => {
          if (cancelled) return;
          const next = s as RouletteRoundState;
          setState((prev) => (rouletteStateEqual(prev, next) ? prev : next));
        })
        .catch(() => {});
    };

    const armAfter = (delayMs: number, everyMs: number) => {
      startTimer = setTimeout(
        () => {
          if (cancelled) return;
          poll();
          intervalId = setInterval(poll, everyMs);
        },
        Math.max(0, delayMs),
      );
    };

    if (state.phase === "betting" && state.ends_at) {
      const endsAtMs = new Date(state.ends_at).getTime();
      if (!Number.isFinite(endsAtMs)) return;
      armAfter(endsAtMs - Date.now(), 1000);
    } else if (state.phase === "spinning") {
      const endRaw = state.spin_ends_at || state.ends_at;
      if (!endRaw) return;
      const endsAtMs = new Date(endRaw).getTime();
      if (!Number.isFinite(endsAtMs)) return;
      armAfter(endsAtMs - Date.now(), 1000);
    } else if (state.phase === "result") {
      armAfter(RESULT_DISPLAY_MS - 500, 1000);
    } else {
      return;
    }

    return () => {
      cancelled = true;
      if (startTimer != null) clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [state?.phase, state?.ends_at, state?.spin_ends_at, state?.round_id]);

  useEffect(() => {
    loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  const myBets = useMemo(() => {
    if (!user?.id) return [];
    return (roundBets?.bets ?? []).filter((bet) => bet.user_id === user.id);
  }, [roundBets?.bets, user?.id]);

  useEffect(() => {
    const phase = state?.phase ?? null;

    if (phase === "result" && lastPhase.current != null && lastPhase.current !== "result") {
      loadHistory();

      const resultNum = state?.result_number;
      if (resultNum != null && myBets.length > 0) {
        const winColor = numberColor(resultNum);
        let creditNanoton = 0;
        for (const bet of myBets) {
          if (bet.color !== winColor) continue;
          creditNanoton += rouletteWinCreditNanoton(
            bet.amount_nanoton,
            bet.color,
            bet.funding_type,
          );
        }
        if (creditNanoton > 0) {
          emitBalanceWin(creditNanoton, { source: "local" });
        }
        haptics.notificationOccurred(creditNanoton > 0 ? "success" : "error");
      }
    }

    lastPhase.current = phase;
  }, [state?.phase, state?.result_number, loadHistory, myBets, haptics]);

  const excludedGiftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bet of roundBets?.bets ?? []) {
      if (bet.user_id === user?.id && bet.gift?.id) {
        ids.add(bet.gift.id);
      }
    }
    return Array.from(ids);
  }, [roundBets?.bets, user?.id]);

  const canBet = acceptBets && state?.phase === "betting" && !betting;
  const canEditBet = !betting;

  const bet = useCallback(
    async (color: RouletteColor) => {
      if (!acceptBets) {
        showToast({
          variant: "error",
          title: "Ставки временно не принимаются",
        });
        haptics.notificationOccurred("error");
        return;
      }
      if (!(acceptBets && state?.phase === "betting" && !betting)) {
        showToast({
          variant: "error",
          title: roulettePhaseBetMessage(state?.phase),
        });
        haptics.notificationOccurred("error");
        return;
      }

      const giftIds = selectedGiftIds.filter((id) => !excludedGiftIds.includes(id));
      const nanotons = Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);

      if (nanotons <= 0 && giftIds.length === 0) {
        showToast({ variant: "error", title: "Укажите сумму TON или выберите подарок." });
        haptics.notificationOccurred("error");
        return;
      }
      if (nanotons > 0 && user && user.betting_balance < nanotons) {
        showToast({ variant: "error", title: "Недостаточно средств на балансе." });
        haptics.notificationOccurred("error");
        return;
      }

      setBetting(true);
      betAmountInput.complete();
      try {
        if (nanotons > 0) {
          await placeRouletteBet(color, crypto.randomUUID(), {
            mode: "balance",
            amountNanoton: nanotons,
          });
        }
        for (const giftId of giftIds) {
          await placeRouletteBet(color, crypto.randomUUID(), {
            mode: "gift",
            inventoryItemId: giftId,
          });
        }
        if (giftIds.length > 0) {
          setSelectedGiftIds([]);
          notifyBettableGiftsChanged();
        }
        haptics.notificationOccurred("success");
        loadRoundBets();
      } catch (e) {
        showToast({
          variant: "error",
          title: formatGameBetError(e),
        });
        haptics.notificationOccurred("error");
      } finally {
        setBetting(false);
      }
    },
    [
      acceptBets,
      amountTon,
      betAmountInput,
      betting,
      excludedGiftIds,
      haptics,
      loadRoundBets,
      selectedGiftIds,
      showToast,
      state?.phase,
      user,
    ],
  );

  return (
    <PageShell flush>
      <div className="roulette-page flex flex-col gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <RouletteWheel state={state} />

        <RouletteHistory
          history={history}
          onSelectRound={(entry) => entry.round_id && setProofRoundId(entry.round_id)}
        />

        {(state?.round_number || state?.server_seed_hash) && (
          <div className="roulette-meta">
            <span>
              {state.round_number != null ? `Раунд #${state.round_number}` : null}
            </span>
            {state.server_seed_hash ? (
              <button
                type="button"
                className="roulette-meta__hash transition hover:text-foreground/70 active:opacity-70"
                title="Проверить честность"
                onClick={() => state.round_id && setProofRoundId(state.round_id)}
              >
                Hash: {state.server_seed_hash.slice(0, 4)}…{state.server_seed_hash.slice(-4)}
              </button>
            ) : null}
          </div>
        )}

        <div className="roulette-controls panel space-y-3 !rounded-[1.35rem] !p-3.5">
          <BetFundingControl
            mode="balance"
            onModeChange={() => {}}
            amountTon={amountTon}
            onAmountTonChange={setAmountTon}
            selectedGiftIds={selectedGiftIds}
            onSelectGifts={setSelectedGiftIds}
            excludedGiftIds={excludedGiftIds}
            disabled={!canEditBet}
            quickAmounts={QUICK_AMOUNTS}
            combined
            amountInputProps={betAmountInput.bind({
              onChange: (e) => setAmountTon(e.target.value),
            })}
          />

          <RouletteRoundBets
            data={roundBets}
            currentUserId={user?.id}
            canBet={canBet}
            onBetColor={bet}
            resultColor={
              state?.phase === "result"
                ? state.result ||
                  (state.result_number != null ? numberColor(state.result_number) : null)
                : null
            }
          />
        </div>
      </div>

      {proofRoundId ? (
        <ProofModal
          roundId={proofRoundId}
          gameType="roulette"
          title="Проверка рулетки"
          onClose={() => setProofRoundId(null)}
        />
      ) : null}
    </PageShell>
  );
}
