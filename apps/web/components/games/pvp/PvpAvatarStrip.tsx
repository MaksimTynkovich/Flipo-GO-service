"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PvpPlayer } from "@/lib/pvp";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import {
  computeSpinOffsets,
  PVP_LAND_CYCLE,
  spinOffsetAtTime,
  spinTimeProgress,
} from "@/lib/pvp-spin";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Props = {
  players: PvpPlayer[];
  winnerId?: string;
  spinning?: boolean;
  spinAt?: string;
  spinEndsAt?: string;
  dimmed?: boolean;
  className?: string;
};

export function PvpAvatarStrip({
  players,
  winnerId,
  spinning = false,
  spinAt,
  spinEndsAt,
  dimmed = false,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const playerKey = useMemo(
    () => players.map((player) => player.user_id).join(":"),
    [players],
  );

  const extendedPlayers = useMemo(() => {
    if (players.length === 0) return [];
    const repeats = PVP_LAND_CYCLE + 4;
    return Array.from({ length: repeats }, () => players).flat();
  }, [playerKey, players]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const update = () => setViewportWidth(node.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (!spinning || !winnerId || !spinAt || !spinEndsAt || players.length === 0 || viewportWidth === 0) {
      strip.style.transform = "translateX(0px)";
      return;
    }

    const winnerIndex = players.findIndex((player) => player.user_id === winnerId);
    if (winnerIndex < 0) return;

    const { targetOffset } = computeSpinOffsets(
      winnerIndex,
      players.length,
      viewportWidth,
    );

    const spinAtMs = new Date(spinAt).getTime();
    const spinEndsAtMs = new Date(spinEndsAt).getTime();

    const frame = () => {
      const now = Date.now();
      const timeProgress = spinTimeProgress(now, spinAtMs, spinEndsAtMs);
      const offset = spinOffsetAtTime(timeProgress, targetOffset);
      strip.style.transform = `translateX(${offset}px)`;

      if (timeProgress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        strip.style.transform = `translateX(${targetOffset}px)`;
        rafRef.current = null;
      }
    };

    frame();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [spinning, winnerId, spinAt, spinEndsAt, viewportWidth, playerKey, players.length]);

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
          "relative mt-4 overflow-hidden rounded-xl bg-surface-raised/80 py-3.5",
          dimmed && "opacity-70",
        )}
      >
        <div ref={stripRef} className="flex will-change-transform px-3" style={{ gap: SLOT_GAP }}>
          {(spinning ? extendedPlayers : players).map((player, index) => (
            <PvpPlayerAvatar
              key={`${player.user_id}-${index}`}
              player={player}
              size={SLOT_SIZE}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--surface-raised)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--surface-raised)] to-transparent" />
      </div>
    </div>
  );
}

const SLOT_SIZE = 44;
const SLOT_GAP = 10;
