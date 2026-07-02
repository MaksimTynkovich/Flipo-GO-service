"use client";

import { useState } from "react";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatTON } from "@/lib/api";

type Room = {
  id: string;
  bet_amount_nanoton: number;
  max_players: number;
  status: string;
};

export default function PvPPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [betAmount, setBetAmount] = useState("500000000");

  async function loadRooms() {
    const data = await api<Room[]>("/api/v1/games/pvp/rooms");
    setRooms(data || []);
  }

  async function createRoom() {
    await api("/api/v1/games/pvp/rooms", {
      method: "POST",
      body: JSON.stringify({ bet_amount_nanoton: Number(betAmount), max_players: 2 }),
    });
    loadRooms();
  }

  async function joinRoom(id: string) {
    await api(`/api/v1/games/pvp/rooms/${id}/join`, { method: "POST" });
    loadRooms();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">PvP Rooms</h1>
      <WalletBar />

      <Card className="space-y-3">
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          placeholder="Bet amount (nanotons)"
        />
        <div className="flex gap-2">
          <Button onClick={createRoom}>Create Room</Button>
          <Button variant="outline" onClick={loadRooms}>Refresh</Button>
        </div>
      </Card>

      <div className="space-y-2">
        {rooms.map((room) => (
          <Card key={room.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{formatTON(room.bet_amount_nanoton)} TON</p>
              <p className="text-xs text-zinc-400">{room.status} · max {room.max_players}</p>
            </div>
            {room.status === "open" && (
              <Button variant="outline" onClick={() => joinRoom(room.id)}>Join</Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
