"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { BetFundingPanel } from "@/components/games/BetFundingPanel";
import {
  PvpActiveRoomCard,
  PvpOpenRoomCard,
  PvpResultRoomCard,
} from "@/components/games/pvp/PvpRoomCards";
import {
  PvpRoomExitShell,
  usePvpFinishedVisibility,
} from "@/components/games/pvp/PvpRecentResults";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, getInventory } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { BetFundingMode, buildPvpStakeBody } from "@/lib/bet-funding";
import { formatGameBetError } from "@/lib/game-errors";
import { giftValuationNanoton } from "@/lib/gifts";
import { PvpLobbyState, PvpRoom } from "@/lib/pvp";
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
  const roomOrderRef = useRef<string[]>([]);

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
  const finished = usePvpFinishedVisibility(state.history);
  const displayRooms = buildStickyRoomList(
    state.active,
    finished.recentById,
    finished.goneIds,
    roomOrderRef,
  );
  const hasRooms = displayRooms.length > 0;
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
          <div className="pvp-create__intro">
            <h2 className="pvp-create__title">Дуэль 1 на 1</h2>
            <p className="pvp-create__text">Создай комнату или войди в открытый бой</p>
          </div>

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
            subtitle="TON и подарки можно комбинировать"
          />

          <Button
            className="pvp-create__cta h-12 w-full rounded-2xl text-base font-bold"
            variant="accent"
            disabled={creating}
            onClick={createRoom}
          >
            {creating ? "Создаём…" : "Создать комнату"}
          </Button>

          {error && !joinRoomId && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
        </section>

        {hasRooms ? (
          <section className="pvp-rooms space-y-2.5">
            <div className="pvp-rooms__head">
              <h2 className="pvp-rooms__title">Комнаты</h2>
              <span className="pvp-rooms__count">{displayRooms.length}</span>
            </div>
            {displayRooms.map((room) => {
              const phase =
                room.status === "finished"
                  ? "result"
                  : room.status === "countdown" || room.status === "spinning"
                    ? "live"
                    : "open";

              const card =
                phase === "result" ? (
                  <PvpResultRoomCard
                    room={room}
                    onProof={
                      room.game_round_id
                        ? () => setProofRoundId(room.game_round_id!)
                        : undefined
                    }
                  />
                ) : phase === "live" ? (
                  <PvpActiveRoomCard room={room} />
                ) : (
                  <PvpOpenRoomCard
                    room={room}
                    canJoin={
                      !room.players.some((player) => player.user_id === userId) &&
                      room.creator_id !== userId
                    }
                    joining={joiningId === room.id}
                    onJoin={() => openJoin(room.id)}
                  />
                );

              return (
                <PvpRoomExitShell
                  key={room.id}
                  leaving={phase === "result" && finished.leavingIds.has(room.id)}
                  className="pvp-room-enter"
                >
                  <div key={phase} className="pvp-phase-swap">
                    {card}
                  </div>
                </PvpRoomExitShell>
              );
            })}
          </section>
        ) : lobbyReady ? (
          <section className="pvp-empty pvp-room-enter">
            <div className="pvp-empty__glow" aria-hidden />
            <p className="pvp-empty__title">Нет открытых дуэлей</p>
            <p className="pvp-empty__text">
              Создай первую комнату выше — соперник сможет присоединиться к твоей ставке.
            </p>
          </section>
        ) : null}

        {joinRoomId && joinRoom ? (
          <ModalOverlay onClose={() => setJoinRoomId(null)} analyticsModalId="pvp_join_room">
            {(close) => (
              <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
                <p className="mb-1 text-center text-[15px] font-semibold">Войти в комнату</p>
                <p className="mb-4 text-center text-xs text-muted">
                  Нужна ставка ≈ {(joinRoom.bet_amount_nanoton / 1_000_000_000).toFixed(2)} TON
                  (±10%)
                </p>

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
                    disabled={!!joiningId || !joinInRange}
                  >
                    {joiningId ? "…" : "Войти"}
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
            title="Проверка PvP"
            onClose={() => setProofRoundId(null)}
          />
        ) : null}
      </div>
    </PageShell>
  );
}

/**
 * Keep finished rooms in the same list position they had while active.
 * New open rooms append; gone rooms drop out of the sticky order.
 */
function buildStickyRoomList(
  active: PvpRoom[],
  recentById: Map<string, PvpRoom>,
  goneIds: Set<string>,
  orderRef: { current: string[] },
): PvpRoom[] {
  const activeById = new Map(active.map((room) => [room.id, room]));
  const presentIds = new Set<string>([
    ...Array.from(activeById.keys()),
    ...Array.from(recentById.keys()),
  ]);

  orderRef.current = orderRef.current.filter(
    (id) => presentIds.has(id) && !goneIds.has(id),
  );

  for (const room of active) {
    if (!orderRef.current.includes(room.id)) {
      orderRef.current.push(room.id);
    }
  }
  for (const id of Array.from(recentById.keys())) {
    if (!orderRef.current.includes(id)) {
      orderRef.current.push(id);
    }
  }

  const rooms: PvpRoom[] = [];
  for (const id of orderRef.current) {
    const room = activeById.get(id) ?? recentById.get(id);
    if (room) rooms.push(room);
  }
  return rooms;
}
