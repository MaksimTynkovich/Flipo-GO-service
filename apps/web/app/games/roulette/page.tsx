"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { RouletteColorBetButton } from "@/components/games/RouletteColorBetButton";
import { RouletteHistory } from "@/components/games/RouletteHistory";
import { RouletteRoundBets } from "@/components/games/RouletteRoundBets";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { GameModeGate } from "@/components/games/GameModeGate";
import { RouletteWheel } from "@/components/games/RouletteWheel";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/components/providers/AuthProvider";
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
import { numberColor, RouletteRoundState } from "@/lib/roulette";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { useAnalyticsInput } from "@/lib/useAnalyticsInput";
import { notifyBettableGiftsChanged } from "@/components/games/useBettableGifts";

const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

export default function RoulettePage() {
  return (
    <GameModeGate mode="roulette">
      <RoulettePageContent />
    </GameModeGate>
  );
}

function RoulettePageContent() {
  const { user } = useAuth();
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

    refreshState();
    loadHistory();
    loadRoundBets();
    const disconnect = connectGameWS(
      "roulette",
      (msg) => {
        if (msg.event === "tick") setState(msg.payload as RouletteRoundState);
        if (msg.event === "bets") setRoundBets(msg.payload as RouletteRoundBetsData);
      },
      { onOpen: refreshState },
    );
    return disconnect;
  }, [loadHistory, loadRoundBets]);

  // HTTP fallback: spin starts only on WS `phase: spinning`. If the socket
  // drops or a tick is missed, countdown hits 0 and the wheel stays static.
  useEffect(() => {
    if (state?.phase !== "betting" || !state.ends_at) return;

    const endsAtMs = new Date(state.ends_at).getTime();
    if (!Number.isFinite(endsAtMs)) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      getRouletteState()
        .then((s) => {
          if (!cancelled) setState(s as RouletteRoundState);
        })
        .catch(() => {});
    };

    const msUntilEnd = endsAtMs - Date.now();
    const startTimer = window.setTimeout(
      () => {
        if (cancelled) return;
        poll();
        intervalId = setInterval(poll, 1000);
      },
      Math.max(0, msUntilEnd),
    );

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [state?.phase, state?.ends_at, state?.round_id]);

  useEffect(() => {
    loadRoundBets();
  }, [state?.round_id, loadRoundBets]);

  const myBets = useMemo(() => {
    if (!user?.id) return [];
    return (roundBets?.bets ?? []).filter((bet) => bet.user_id === user.id);
  }, [roundBets?.bets, user?.id]);

  const myColors = useMemo(() => {
    const set = new Set<"red" | "green" | "black">();
    for (const bet of myBets) {
      if (bet.color === "red" || bet.color === "green" || bet.color === "black") {
        set.add(bet.color);
      }
    }
    return set;
  }, [myBets]);

  const myStakeByColor = useMemo(() => {
    const map: Record<"red" | "green" | "black", number> = {
      red: 0,
      green: 0,
      black: 0,
    };
    for (const bet of myBets) {
      if (bet.color === "red" || bet.color === "green" || bet.color === "black") {
        map[bet.color] += bet.amount_nanoton;
      }
    }
    return map;
  }, [myBets]);

  useEffect(() => {
    const phase = state?.phase ?? null;

    if (phase === "result" && lastPhase.current != null && lastPhase.current !== "result") {
      loadHistory();

      const resultNum = state?.result_number;
      if (resultNum != null && myBets.length > 0) {
        const winColor = numberColor(resultNum);
        const won = myBets.some((bet) => bet.color === winColor);
        haptics.notificationOccurred(won ? "success" : "error");
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

  const canBet = state?.phase === "betting" && !betting;
  const canEditBet = !betting;
  const roundTotals = roundBets?.totals ?? { red: 0, green: 0, black: 0 };

  async function bet(color: string) {
    if (!canBet) {
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
  }

  return (
    <PageShell flush>
      <div className="roulette-page flex flex-col gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="roulette-page__aurora" aria-hidden>
          <span className="roulette-page__blob roulette-page__blob--a" />
          <span className="roulette-page__blob roulette-page__blob--b" />
          <span className="roulette-page__blob roulette-page__blob--c" />
        </div>

        <RouletteWheel state={state} />

        <RouletteHistory
          history={history}
          onSelectRound={(entry) => entry.round_id && setProofRoundId(entry.round_id)}
        />

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

          <div className="grid grid-cols-3 gap-2">
            <RouletteColorBetButton
              color="red"
              multiplier="×2"
              roundTotal={roundTotals.red}
              myStake={myStakeByColor.red}
              disabled={!canBet}
              active={myColors.has("red")}
              onClick={() => bet("red")}
            />
            <RouletteColorBetButton
              color="green"
              multiplier="×14"
              roundTotal={roundTotals.green}
              myStake={myStakeByColor.green}
              disabled={!canBet}
              active={myColors.has("green")}
              onClick={() => bet("green")}
            />
            <RouletteColorBetButton
              color="black"
              multiplier="×2"
              roundTotal={roundTotals.black}
              myStake={myStakeByColor.black}
              disabled={!canBet}
              active={myColors.has("black")}
              onClick={() => bet("black")}
            />
          </div>

          <div className="hairline-top pt-3">
            <RouletteRoundBets
              data={roundBets}
              currentUserId={user?.id}
              resultColor={
                state?.phase === "result"
                  ? state.result ||
                    (state.result_number != null ? numberColor(state.result_number) : null)
                  : null
              }
            />
          </div>
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
