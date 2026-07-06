"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PvpPlayer, PVP_SPIN_MS } from "@/lib/pvp";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

const SLOT_SIZE = 40;
const SLOT_GAP = 8;
const SLOT_STEP = SLOT_SIZE + SLOT_GAP;

type Props = {
  players: PvpPlayer[];
  winnerId?: string;
  spinning?: boolean;
  spinEndsAt?: string;
  dimmed?: boolean;
  className?: string;
};

export function PvpAvatarStrip({
  players,
  winnerId,
  spinning = false,
  spinEndsAt,
  dimmed = false,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [durationMs, setDurationMs] = useState(PVP_SPIN_MS);

  const extendedPlayers = useMemo(() => {
    if (players.length === 0) return [];
    const repeats = 14;
    return Array.from({ length: repeats }, () => players).flat();
  }, [players]);

  useEffect(() => {
    if (!spinning || !winnerId || players.length === 0) {
      setOffset(0);
      return;
    }

    const viewportWidth = viewportRef.current?.clientWidth ?? 220;
    const winnerIndex = players.findIndex((player) => player.user_id === winnerId);
    if (winnerIndex < 0) return;

    const landCycle = 10;
    const landIndex = landCycle * players.length + winnerIndex;
    const centerOffset = viewportWidth / 2 - SLOT_SIZE / 2;
    const targetOffset = -(landIndex * SLOT_STEP) + centerOffset;

    const endsAt = spinEndsAt ? new Date(spinEndsAt).getTime() : Date.now() + 3000;
    const remaining = Math.max(endsAt - Date.now(), 1200);

    setDurationMs(remaining);
    requestAnimationFrame(() => setOffset(targetOffset));
  }, [spinning, winnerId, players, spinEndsAt]);

  const staticWinnerId = !spinning ? winnerId : undefined;
  const staticOffset = useMemo(() => {
    if (spinning || !winnerId || players.length === 0) return 0;
    const winnerIndex = players.findIndex((player) => player.user_id === winnerId);
    if (winnerIndex < 0) return 0;
    const viewportWidth = 220;
    const centerOffset = viewportWidth / 2 - SLOT_SIZE / 2;
    return -(winnerIndex * SLOT_STEP) + centerOffset;
  }, [spinning, winnerId, players]);

  if (players.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 text-accent">
        <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative mt-3 overflow-hidden rounded-xl bg-surface-raised/70 px-1 py-3",
          dimmed && "opacity-70",
        )}
      >
        <div
          className="flex will-change-transform"
          style={{
            gap: SLOT_GAP,
            transform: `translateX(${spinning ? offset : staticOffset}px)`,
            transition: spinning ? `transform ${durationMs}ms cubic-bezier(0.12, 0.8, 0.18, 1)` : undefined,
          }}
        >
          {(spinning ? extendedPlayers : players).map((player, index) => (
            <PvpPlayerAvatar
              key={`${player.user_id}-${index}`}
              player={player}
              size={SLOT_SIZE}
              highlight={
                staticWinnerId && player.user_id === staticWinnerId ? "winner" : "none"
              }
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--surface-raised)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--surface-raised)] to-transparent" />
      </div>
    </div>
  );
}
