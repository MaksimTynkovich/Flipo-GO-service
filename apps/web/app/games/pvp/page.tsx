"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { api, formatTON } from "@/lib/api";

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

export default function PvPPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [betAmount, setBetAmount] = useState("0.5");
  const [loading, setLoading] = useState(false);

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
    if (nanotons <= 0) return;
    await api("/api/v1/games/pvp/rooms", {
      method: "POST",
      body: JSON.stringify({ bet_amount_nanoton: nanotons, max_players: 2 }),
    });
    loadRooms();
  }

  async function joinRoom(id: string) {
    await api(`/api/v1/games/pvp/rooms/${id}/join`, { method: "POST" });
    loadRooms();
  }

  return (
    <PageShell title="PvP" description="Создай комнату или присоединись к существующей">
      <div className="panel space-y-3">
        <p className="section-label">Новая комната</p>
        <div className="flex items-center rounded-xl border border-border bg-surface-raised px-4 py-3">
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full bg-transparent text-center text-base font-semibold tabular-nums outline-none"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="0.00"
          />
          <span className="text-sm text-muted">TON</span>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={createRoom}>
            Создать
          </Button>
          <Button className="flex-1" variant="outline" onClick={loadRooms} disabled={loading}>
            {loading ? "…" : "Обновить"}
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <p className="section-label">Открытые комнаты</p>
        {rooms.length === 0 ? (
          <div className="panel py-6 text-center text-sm text-muted">
            Комнат пока нет — создай первую
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="panel flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold tabular-nums">
                  {formatTON(room.bet_amount_nanoton)} TON
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
