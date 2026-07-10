"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { ProofModal } from "@/components/provably-fair/ProofModal";
import { BetFundingControl } from "@/components/games/BetFundingControl";
import { BetFundingPanel } from "@/components/games/BetFundingPanel";
import {
  PvpActiveRoomCard,
  PvpOpenRoomCard,
} from "@/components/games/pvp/PvpRoomCards";
import {
  hasRecentPvpResults,
  PvpRecentResults,
} from "@/components/games/pvp/PvpRecentResults";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, formatTON, getInventory } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { BetFundingMode } from "@/lib/bet-funding";
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
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

const PVP_MAX_PLAYERS = 2;
const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

function mapPvpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("room is full")) return "Комната уже заполнена";
  if (lower.includes("already joined")) return "Вы уже в этой комнате";
  if (lower.includes("insufficient balance")) return "Недостаточно средств на балансе";
  if (lower.includes("invalid amount")) return "Укажите корректную ставку";
  if (lower.includes("gift not available") || lower.includes("подарок недоступен")) {
    return "Подарок недоступен для ставки.";
  }
  if (lower.includes("gift value") || lower.includes("стоимость подарка") || lower.includes("±10%")) {
    return "Сумма подарка не подходит для ставки в этой комнате.";
  }
  return message;
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
  const [joinGiftIds, setJoinGiftIds] = useState<string[]>([]);
  const [joinGiftStakeNanoton, setJoinGiftStakeNanoton] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofRoundId, setProofRoundId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

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
      setJoinGiftStakeNanoton(null);
      return;
    }
    void getInventory().then((items) => {
      const item = items.find((entry) => entry.id === joinGiftIds[0]);
      setJoinGiftStakeNanoton(item ? giftValuationNanoton(item) : null);
    });
  }, [joinRoomId, joinGiftIds]);

  async function createRoom() {
    if (fundingMode === "gift") {
      if (selectedGiftIds.length === 0) {
        setError("Выберите подарок для ставки.");
        return;
      }
    } else {
      const nanotons = Math.floor(parseFloat(betAmount || "0") * 1_000_000_000);
      if (nanotons <= 0) return;
      if (user && user.betting_balance < nanotons) {
        setError("Недостаточно средств на балансе.");
        return;
      }
    }

    setCreating(true);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      const body =
        fundingMode === "gift" && selectedGiftIds[0]
          ? { funding: "gift", inventory_item_id: selectedGiftIds[0], max_players: PVP_MAX_PLAYERS }
          : {
              bet_amount_nanoton: Math.floor(parseFloat(betAmount || "0") * 1_000_000_000),
              max_players: PVP_MAX_PLAYERS,
            };
      await api("/api/v1/games/pvp/rooms", {
        method: "POST",
        body: JSON.stringify(body),
      });
      trackEvent({
        event_name: "pvp_room_created",
        event_category: "pvp",
        status: "success",
        properties: { mode: "pvp", funding: fundingMode },
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
    setJoinRoomId(roomId);
    setJoinFundingMode("balance");
    setJoinGiftIds([]);
    setJoinGiftStakeNanoton(null);
    setError(null);
  }

  async function confirmJoin() {
    if (!joinRoomId) return;
    const room = state.active.find((item) => item.id === joinRoomId);
    if (!room) return;

    if (joinFundingMode === "gift") {
      if (joinGiftIds.length === 0) {
        setError("Выберите подарок для ставки.");
        return;
      }
      if (
        joinGiftStakeNanoton != null &&
        !pvpGiftWithinTolerance(room.bet_amount_nanoton, joinGiftStakeNanoton)
      ) {
        setError("Сумма подарка не подходит для ставки в этой комнате.");
        return;
      }
    } else if (user && user.betting_balance < room.bet_amount_nanoton) {
      setError("Недостаточно средств на балансе.");
      return;
    }

    setJoiningId(joinRoomId);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      const body =
        joinFundingMode === "gift" && joinGiftIds[0]
          ? { funding: "gift", inventory_item_id: joinGiftIds[0] }
          : { funding: "balance", amount_nanoton: room.bet_amount_nanoton };
      await api(`/api/v1/games/pvp/rooms/${joinRoomId}/join`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      trackEvent({
        event_name: "pvp_room_joined",
        event_category: "pvp",
        status: "success",
        properties: { mode: "pvp", room_id: joinRoomId, funding: joinFundingMode },
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
  const activeRooms = state.active;
  const hasRecentResults = hasRecentPvpResults(state.history, now);
  const hasRooms = activeRooms.length > 0 || hasRecentResults;
  const joinRoom = state.active.find((room) => room.id === joinRoomId);
  const joinBounds = joinRoom ? pvpStakeBounds(joinRoom.bet_amount_nanoton) : null;
  const joinGiftInRange =
    joinRoom && joinGiftStakeNanoton
      ? pvpGiftWithinTolerance(joinRoom.bet_amount_nanoton, joinGiftStakeNanoton)
      : false;
  const joinWinChanceBps =
    joinRoom && joinGiftStakeNanoton && joinGiftInRange
      ? estimateJoinWinChanceBps(joinRoom.bet_amount_nanoton, joinGiftStakeNanoton)
      : joinRoom && joinFundingMode === "balance"
        ? estimateJoinWinChanceBps(joinRoom.bet_amount_nanoton, joinRoom.bet_amount_nanoton)
        : null;

  return (
    <PageShell flush>
      <section className="panel space-y-3">
        <p className="section-label">Создать комнату 1 на 1</p>

        <BetFundingControl
          mode={fundingMode}
          onModeChange={setFundingMode}
          amountTon={betAmount}
          onAmountTonChange={setBetAmount}
          selectedGiftIds={selectedGiftIds}
          onSelectGifts={setSelectedGiftIds}
          disabled={creating}
          quickAmounts={QUICK_AMOUNTS}
          multiple={false}
          title="Ставка комнаты"
          subtitle="Сумма TON или один подарок — это ставка комнаты"
        />

        <Button className="h-11 w-full rounded-xl" variant="accent" disabled={creating} onClick={createRoom}>
          {creating ? "Создаём…" : "Создать комнату"}
        </Button>

        {error && !joinRoomId && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
      </section>

      {hasRooms ? (
        <section className="space-y-2">
          {activeRooms.map((room) => {
            if (room.status === "countdown" || room.status === "spinning") {
              return <PvpActiveRoomCard key={room.id} room={room} />;
            }
            const alreadyJoined = room.players.some((player) => player.user_id === userId);
            const isCreator = room.creator_id === userId;
            return (
              <PvpOpenRoomCard
                key={room.id}
                room={room}
                canJoin={!alreadyJoined && !isCreator}
                joining={joiningId === room.id}
                onJoin={() => openJoin(room.id)}
              />
            );
          })}
          <PvpRecentResults
            history={state.history}
            onProof={(room) => {
              if (room.game_round_id) setProofRoundId(room.game_round_id);
            }}
          />
        </section>
      ) : lobbyReady ? (
        <section className="panel flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">Нет открытых дуэлей</p>
          <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
            Создайте первую комнату выше — соперник сможет присоединиться к вашей ставке.
          </p>
        </section>
      ) : null}

      {joinRoomId && joinRoom ? (
        <ModalOverlay onClose={() => setJoinRoomId(null)} analyticsModalId="pvp_join_room">
          {(close) => (
          <div className="sheet-panel relative mx-auto w-full max-w-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-raised" />
            <p className="mb-1 text-center text-[15px] font-semibold">Войти в комнату</p>
            <p className="mb-1 text-center text-xs text-muted">
              Ставка комнаты: {formatTON(joinRoom.bet_amount_nanoton)} TON · допуск ±10%
            </p>
            {joinBounds && (
              <p className="mb-4 text-center text-[11px] text-muted">
                Подарок: {formatTON(joinBounds.min)} – {formatTON(joinBounds.max)} TON
              </p>
            )}

            <BetFundingPanel
              mode={joinFundingMode}
              onModeChange={setJoinFundingMode}
              amountTon={(joinRoom.bet_amount_nanoton / 1_000_000_000).toFixed(2)}
              onAmountTonChange={() => {}}
              selectedGiftIds={joinGiftIds}
              onSelectGifts={setJoinGiftIds}
              disabled={!!joiningId}
              multiple={false}
              layout="sheet"
              amountLocked
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
              <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
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
                disabled={!!joiningId}
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
    </PageShell>
  );
}
