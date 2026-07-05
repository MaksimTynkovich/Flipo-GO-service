"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { api, formatTON } from "@/lib/api";
import { TonAmount, TonIcon } from "@/components/icons/TonIcon";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

type Room = {
  id: string;
  bet_amount_nanoton: number;
  max_players: number;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Открыта",
  full: "Полная",
  playing: "Идёт игра",
  finished: "Завершена",
};

export function PvpHubView() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [betAmount, setBetAmount] = useState("0.5");
  const [loading, setLoading] = useState(false);
  const haptics = useTelegramHaptics();

  async function loadRooms() {
    setLoading(true);
    try {
      const data = await api<Room[]>("/api/v1/games/pvp/rooms");
      setRooms(data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
  }, []);

  async function createRoom() {
    const nanotons = Math.floor(parseFloat(betAmount || "0") * 1_000_000_000);
    if (nanotons <= 0) {
      return;
    }

    haptics.impactOccurred("medium");
    await api("/api/v1/games/pvp/rooms", {
      method: "POST",
      body: JSON.stringify({ bet_amount_nanoton: nanotons, max_players: 2 }),
    });
    await loadRooms();
  }

  async function joinRoom(id: string) {
    haptics.impactOccurred("medium");
    await api(`/api/v1/games/pvp/rooms/${id}/join`, { method: "POST" });
    await loadRooms();
  }

  return (
    <PageShell flush>
      <div className="panel space-y-3">
        <p className="section-label">Новая комната</p>
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
        <div className="grid grid-cols-2 gap-2">
          <Button className="w-full" variant="accent" onClick={createRoom}>
            Создать
          </Button>
          <Button className="w-full" variant="outline" onClick={loadRooms} disabled={loading}>
            {loading ? "…" : "Обновить"}
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <p className="section-label">Открытые комнаты</p>
          <span className="text-xs text-muted">{rooms.length}</span>
        </div>
        {rooms.length === 0 ? (
          <div className="panel py-6 text-center text-sm text-muted">Комнат пока нет. Создай первую.</div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="panel flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold tabular-nums">
                  <TonAmount amount={formatTON(room.bet_amount_nanoton)} />
                </p>
                <p className="text-xs text-muted">
                  {STATUS_LABEL[room.status] ?? room.status} · до {room.max_players} игроков
                </p>
              </div>
              {room.status === "open" && (
                <Button variant="outline" onClick={() => joinRoom(room.id)}>
                  Войти
                </Button>
              )}
            </div>
          ))
        )}
      </section>
    </PageShell>
  );
}
