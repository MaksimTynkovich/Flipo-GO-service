"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { BtnBusy } from "@/components/ui/BtnBusy";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { BetFundingPanel } from "@/components/games/BetFundingPanel";
import {
  PvpRoomCardView,
} from "@/components/games/pvp/PvpRoomCards";
import {
  PvpEmptyRoomSlot,
  PvpRoomExitShell,
  usePvpRoomSlots,
} from "@/components/games/pvp/PvpRecentResults";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAcceptBets } from "@/components/providers/MaintenanceGate";
import { api, getInventory } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { BetFundingMode, buildPvpStakeBody } from "@/lib/bet-funding";
import { formatGameBetError } from "@/lib/game-errors";
import { giftValuationNanoton } from "@/lib/gifts";
import { PvpLobbyState } from "@/lib/pvp";
import {
  estimateJoinWinChanceBps,
  formatWinChanceBps,
  pvpGiftWithinTolerance,
  pvpStakeBounds,
} from "@/lib/pvp-stake";
import { connectGameWS } from "@/lib/ws";
import { formatUserError } from "@/lib/user-errors";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

const PVP_MAX_PLAYERS = 2;
const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

function mapPvpError(message: string): string {
  return formatUserError(message, "Не удалось выполнить действие");
}

function tonToNanoton(amountTon: string): number {
  const n = Math.floor(parseFloat(amountTon || "0") * 1_000_000_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function PvpHubView() {
  const { user } = useAuth();
  const acceptBets = useAcceptBets();
  const haptics = useTelegramHaptics();
  const [state, setState] = useState<PvpLobbyState>({ active: [], history: [] });
  const [lobbyReady, setLobbyReady] = useState(false);
  const [betAmount, setBetAmount] = useState("0.5");
  const [fundingMode, setFundingMode] = useState<BetFundingMode>("balance");
  const [selectedGiftIds, setSelectedGiftIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinRoomId, setJoinRoomId] = useState<string | null>(null);
  const [joinFundingMode, setJoinFundingMode] = useState<BetFundingMode>("balance");
  const [joinAmountTon, setJoinAmountTon] = useState("0");
  const [joinGiftIds, setJoinGiftIds] = useState<string[]>([]);
  const [joinGiftStakeNanoton, setJoinGiftStakeNanoton] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proofRoundId, setProofRoundId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const data = await api<PvpLobbyState>("/api/v1/games/pvp/rooms");
      setState({
        active: data.active ?? [],
        history: data.history ?? [],
      });
    } catch {
      // ignore polling errors
    } finally {
      setLobbyReady(true);
    }
  }, []);

  useEffect(() => {
    loadState();
    const disconnect = connectGameWS("pvp", (msg) => {
      if (msg.event === "tick") {
        const payload = msg.payload as PvpLobbyState;
        setState({
          active: payload.active ?? [],
          history: payload.history ?? [],
        });
      }
    });
    const poll = window.setInterval(loadState, 1500);
    return () => {
      disconnect();
      window.clearInterval(poll);
    };
  }, [loadState]);

  useEffect(() => {
    if (!joinRoomId || joinGiftIds.length === 0) {
      setJoinGiftStakeNanoton(0);
      return;
    }
    void getInventory().then((items) => {
      const total = joinGiftIds.reduce((sum, id) => {
        const item = items.find((entry) => entry.id === id);
        return sum + (item ? giftValuationNanoton(item) : 0);
      }, 0);
      setJoinGiftStakeNanoton(total);
    });
  }, [joinRoomId, joinGiftIds]);

  async function createRoom() {
    if (!acceptBets) {
      setError("Ставки временно не принимаются");
      return;
    }
    const tonNanoton = tonToNanoton(betAmount);
    if (tonNanoton <= 0 && selectedGiftIds.length === 0) {
      setError("Укажите TON и/или выберите подарки для ставки.");
      return;
    }
    if (tonNanoton > 0 && user && user.betting_balance < tonNanoton) {
      setError("Недостаточно средств на балансе.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      const body = buildPvpStakeBody({
        amountNanoton: tonNanoton,
        giftIds: selectedGiftIds,
        amountKey: "bet_amount_nanoton",
        extra: { max_players: PVP_MAX_PLAYERS },
      });
      await api("/api/v1/games/pvp/rooms", {
        method: "POST",
        body: JSON.stringify(body),
      });
      trackEvent({
        event_name: "pvp_room_created",
        event_category: "pvp",
        status: "success",
        properties: { mode: "pvp", funding: body.funding },
      });
      await loadState();
    } catch (e) {
      trackEvent({
        event_name: "pvp_room_created",
        event_category: "pvp",
        status: "error",
        error_code: "create_failed",
        error_message: e instanceof Error ? e.message : "create_failed",
        properties: { mode: "pvp", funding: fundingMode },
      });
      setError(mapPvpError(e instanceof Error ? e.message : "Не удалось создать комнату"));
    } finally {
      setCreating(false);
    }
  }

  function openJoin(roomId: string) {
    if (!acceptBets) {
      setError("Ставки временно не принимаются");
      return;
    }
    const room = state.active.find((item) => item.id === roomId);
    setJoinRoomId(roomId);
    setJoinFundingMode("balance");
    setJoinAmountTon(
      room ? (room.bet_amount_nanoton / 1_000_000_000).toFixed(2) : "0",
    );
    setJoinGiftIds([]);
    setJoinGiftStakeNanoton(0);
    setError(null);
  }

  async function confirmJoin() {
    if (!acceptBets) {
      setError("Ставки временно не принимаются");
      return;
    }
    if (!joinRoomId) return;
    const room = state.active.find((item) => item.id === joinRoomId);
    if (!room) return;

    const tonNanoton = tonToNanoton(joinAmountTon);
    const joinTotal = tonNanoton + joinGiftStakeNanoton;
    if (joinTotal <= 0) {
      setError("Укажите TON и/или выберите подарки для ставки.");
      return;
    }
    if (!pvpGiftWithinTolerance(room.bet_amount_nanoton, joinTotal)) {
      const { min, max } = pvpStakeBounds(room.bet_amount_nanoton);
      setError(
        `Сумма ставки должна быть от ${(min / 1e9).toFixed(2)} до ${(max / 1e9).toFixed(2)} TON.`,
      );
      return;
    }
    if (tonNanoton > 0 && user && user.betting_balance < tonNanoton) {
      setError("Недостаточно средств на балансе.");
      return;
    }

    setJoiningId(joinRoomId);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      const body = buildPvpStakeBody({
        amountNanoton: tonNanoton,
        giftIds: joinGiftIds,
        amountKey: "amount_nanoton",
      });
      await api(`/api/v1/games/pvp/rooms/${joinRoomId}/join`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      trackEvent({
        event_name: "pvp_room_joined",
        event_category: "pvp",
        status: "success",
        properties: { mode: "pvp", room_id: joinRoomId, funding: body.funding },
      });
      setJoinRoomId(null);
      await loadState();
    } catch (e) {
      trackEvent({
        event_name: "pvp_room_joined",
        event_category: "pvp",
        status: "error",
        error_code: "join_failed",
        error_message: e instanceof Error ? e.message : "join_failed",
        properties: { mode: "pvp", room_id: joinRoomId, funding: joinFundingMode },
      });
      setError(formatGameBetError(e) || mapPvpError(e instanceof Error ? e.message : "Не удалось войти в комнату"));
    } finally {
      setJoiningId(null);
    }
  }

  const userId = user?.id;
  const { slots, occupied } = usePvpRoomSlots(state.active, state.history);
  const joinRoom = state.active.find((room) => room.id === joinRoomId);
  const joinTonNanoton = tonToNanoton(joinAmountTon);
  const joinTotalNanoton = joinTonNanoton + joinGiftStakeNanoton;
  const joinInRange =
    joinRoom && joinTotalNanoton > 0
      ? pvpGiftWithinTolerance(joinRoom.bet_amount_nanoton, joinTotalNanoton)
      : false;
  const joinWinChanceBps =
    joinRoom && joinInRange
      ? estimateJoinWinChanceBps(joinRoom.bet_amount_nanoton, joinTotalNanoton)
      : null;

  return (
    <PageShell flush>
      <div className="pvp-page flex flex-col gap-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pvp-page__aurora" aria-hidden>
          <span className="pvp-page__blob pvp-page__blob--a" />
          <span className="pvp-page__blob pvp-page__blob--b" />
          <span className="pvp-page__blob pvp-page__blob--c" />
        </div>

        <section className="pvp-create space-y-3">
          <BetFundingControl
            mode={fundingMode}
            onModeChange={setFundingMode}
            amountTon={betAmount}
            onAmountTonChange={setBetAmount}
            selectedGiftIds={selectedGiftIds}
            onSelectGifts={setSelectedGiftIds}
            disabled={creating}
            quickAmounts={QUICK_AMOUNTS}
            multiple
            combined
            title="Ставка комнаты"
          />

          <Button
            className="pvp-create__cta h-12 w-full rounded-2xl text-base font-bold"
            variant="accent"
            disabled={creating || !acceptBets}
            onClick={createRoom}
          >
            {creating ? (
              <BtnBusy label="Создаём…" />
            ) : !acceptBets ? (
              "Ставки временно закрыты"
            ) : (
              "Создать комнату"
            )}
          </Button>

          {error && !joinRoomId && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
        </section>

        <section className="pvp-rooms">
          <div className="pvp-rooms__head">
            <h2 className="pvp-rooms__title">Комнаты</h2>
            <span className="pvp-rooms__count">{occupied}</span>
          </div>
          <div className="pvp-rooms__list">
            {slots.map((slot) => (
              <PvpRoomExitShell
                key={slot.index}
                empty={!slot.room}
                entering={slot.entering}
                leaving={slot.leaving}
              >
                {slot.room ? (
                  <PvpRoomCardView
                    room={slot.room}
                    userId={userId}
                    joining={joiningId === slot.room.id}
                    onJoin={() => openJoin(slot.room!.id)}
                    onProof={
                      slot.room.game_round_id
                        ? () => setProofRoundId(slot.room!.game_round_id!)
                        : undefined
                    }
                  />
                ) : (
                  <PvpEmptyRoomSlot />
                )}
              </PvpRoomExitShell>
            ))}
          </div>
          {!lobbyReady ? null : occupied === 0 ? (
            <p className="pvp-rooms__hint">Свободные места ждут первую комнату</p>
          ) : null}
        </section>

        {joinRoomId && joinRoom ? (
          <ModalOverlay onClose={() => setJoinRoomId(null)} analyticsModalId="pvp_join_room">
            {(close) => (
              <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
                <p className="mb-1 text-center text-[15px] font-semibold">Войти в комнату</p>

                <BetFundingPanel
                  mode={joinFundingMode}
                  onModeChange={setJoinFundingMode}
                  amountTon={joinAmountTon}
                  onAmountTonChange={setJoinAmountTon}
                  selectedGiftIds={joinGiftIds}
                  onSelectGifts={setJoinGiftIds}
                  disabled={!!joiningId}
                  multiple
                  layout="sheet"
                  combined
                  quickAmounts={QUICK_AMOUNTS}
                />

                {joinWinChanceBps != null && (
                  <p className="mt-3 text-center text-xs text-muted">
                    Ваш шанс на победу:{" "}
                    <span className="font-semibold text-foreground">
                      {formatWinChanceBps(joinWinChanceBps)}
                    </span>
                  </p>
                )}

                {error && (
                  <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={close}
                    disabled={!!joiningId}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="accent"
                    className="h-11 rounded-xl"
                    onClick={confirmJoin}
                    disabled={!!joiningId || !joinInRange || !acceptBets}
                  >
                    {joiningId ? <BtnBusy label="Входим…" /> : "Войти"}
                  </Button>
                </div>
              </div>
            )}
          </ModalOverlay>
        ) : null}

        {proofRoundId ? (
          <ProofModal
            roundId={proofRoundId}
            gameType="pvp"
            title="Проверка комнаты"
            onClose={() => setProofRoundId(null)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
