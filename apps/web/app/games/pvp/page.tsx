"use client";

import { GameModeGate } from "@/components/games/GameModeGate";
import { PvpHubView } from "@/src/views/pvp";

export default function GamesPvpPage() {
  return (
    <GameModeGate mode="pvp">
      <PvpHubView />
    </GameModeGate>
  );
}
