"use client";

import { GameModeGate } from "@/components/games/GameModeGate";
import { WheelView } from "@/src/views/games/ui/WheelView";

export default function WheelPage() {
  return (
    <GameModeGate mode="wheel">
      <WheelView />
    </GameModeGate>
  );
}
