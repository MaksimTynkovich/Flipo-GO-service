"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import {
  PvpActiveRoomCard,
  PvpOpenRoomCard,
  PvpResultRoomCard,
} from "@/components/games/pvp/PvpRoomCards";
import { TonIcon } from "@/components/icons/TonIcon";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/lib/api";
import { PvpLobbyState } from "@/lib/pvp";
import { connectGameWS } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

const PVP_MAX_PLAYERS = 2;
const QUICK_AMOUNTS = ["0.1", "0.5", "1", "5"];

function mapPvpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("room is full")) return "Комната уже заполнена";
  if (lower.includes("already joined")) return "Вы уже в этой комнате";
  if (lower.includes("insufficient balance")) return "Недостаточно средств на балансе";
  if (lower.includes("invalid amount")) return "Укажите корректную ставку";
  return message;
}

export function PvpHubView() {
  const { user } = useAuth();
  const haptics = useTelegramHaptics();
  const [state, setState] = useState<PvpLobbyState>({ active: [], history: [] });
  const [betAmount, setBetAmount] = useState("0.5");
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const data = await api<PvpLobbyState>("/api/v1/games/pvp/rooms");
      setState({
        active: data.active ?? [],
        history: data.history ?? [],
      });
    } catch {
      // ignore polling errors
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

  async function createRoom() {
    const nanotons = Math.floor(parseFloat(betAmount || "0") * 1_000_000_000);
    if (nanotons <= 0) return;

    setCreating(true);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      await api("/api/v1/games/pvp/rooms", {
        method: "POST",
        body: JSON.stringify({ bet_amount_nanoton: nanotons, max_players: PVP_MAX_PLAYERS }),
      });
      await loadState();
    } catch (e) {
      setError(mapPvpError(e instanceof Error ? e.message : "Не удалось создать комнату"));
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(id: string) {
    setJoiningId(id);
    setError(null);
    try {
      haptics.impactOccurred("medium");
      await api(`/api/v1/games/pvp/rooms/${id}/join`, { method: "POST" });
      await loadState();
    } catch (e) {
      setError(mapPvpError(e instanceof Error ? e.message : "Не удалось войти в комнату"));
    } finally {
      setJoiningId(null);
    }
  }

  const userId = user?.id;
  const openRooms = state.active.filter((room) => room.status === "open");
  const liveRooms = state.active.filter((room) => room.status === "countdown" || room.status === "spinning");

  return (
    <PageShell flush>
      <section className="panel space-y-3">
        <p className="section-label">Создать комнату 1 на 1</p>
        <div className="input-inset">
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full bg-transparent text-center text-base font-semibold tabular-nums outline-none"
            value={betAmount}
            onChange={(event) => setBetAmount(event.target.value)}
            placeholder="0.00"
          />
          <TonIcon variant="brand" className="h-5 w-5 shrink-0" title="TON" />
        </div>

        <div className="flex gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                haptics.impactOccurred("light");
                setBetAmount(amount);
              }}
              className={cn("quick-amount", betAmount === amount && "quick-amount-active")}
            >
              {amount}
            </button>
          ))}
        </div>

        <Button className="h-11 w-full rounded-xl" variant="accent" disabled={creating} onClick={createRoom}>
          {creating ? "Создаём…" : "Создать комнату"}
        </Button>

        {error && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
      </section>

      {liveRooms.length > 0 && (
        <section className="space-y-2">
          <p className="section-label px-0.5">Сейчас в игре</p>
          {liveRooms.map((room) => (
            <PvpActiveRoomCard key={room.id} room={room} />
          ))}
        </section>
      )}

      {openRooms.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <p className="section-label">Открытые комнаты</p>
            <span className="text-xs text-muted">{openRooms.length}</span>
          </div>
          {openRooms.map((room) => {
            const alreadyJoined = room.players.some((player) => player.user_id === userId);
            const isCreator = room.creator_id === userId;
            return (
              <PvpOpenRoomCard
                key={room.id}
                room={room}
                canJoin={!alreadyJoined && !isCreator}
                joining={joiningId === room.id}
                onJoin={() => joinRoom(room.id)}
              />
            );
          })}
        </section>
      )}

      {state.history.length > 0 && (
        <section className="space-y-2">
          <p className="section-label px-0.5">Недавние игры</p>
          {state.history.map((room) => (
            <PvpResultRoomCard key={room.id} room={room} />
          ))}
        </section>
      )}
    </PageShell>
  );
}
