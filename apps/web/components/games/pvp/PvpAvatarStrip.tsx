"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { PvpPlayer } from "@/lib/pvp";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { highlightStrengthAtIndex } from "@/lib/pvp-highlight";
import { computeSpinOffsets, PVP_LAND_CYCLE, spinOffsetAtTime, spinTimeProgress } from "@/lib/pvp-spin";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Props = {
  players: PvpPlayer[];
  winnerId?: string;
  spinning?: boolean;
  previewSpinning?: boolean;
  spinAt?: string;
  spinEndsAt?: string;
  dimmed?: boolean;
  className?: string;
};

export function PvpAvatarStrip({
  players,
  winnerId,
  spinning = false,
  previewSpinning = false,
  spinAt,
  spinEndsAt,
  dimmed = false,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
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

    if (players.length === 0 || viewportWidth === 0) {
      clearSlotHighlights(slotRefs.current);
      return;
    }

    if (!spinning || !winnerId || !spinAt || !spinEndsAt) {
      if (previewSpinning) {
        const previewIndex = players.length * PVP_LAND_CYCLE;
        const previewOffset = -(previewIndex * (SLOT_SIZE + SLOT_GAP)) + (viewportWidth / 2 - SLOT_SIZE / 2);
        strip.style.transform = `translateX(${previewOffset}px)`;
      } else {
        strip.style.transform = "translateX(0px)";
      }
      clearSlotHighlights(slotRefs.current);
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

      const centerPosition = getCenteredSlotPosition(offset, viewportWidth, extendedPlayers.length);
      updateSlotHighlights(slotRefs.current, centerPosition);

      if (timeProgress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
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
  }, [spinning, previewSpinning, winnerId, spinAt, spinEndsAt, viewportWidth, playerKey, players.length, extendedPlayers.length]);

  if (players.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 text-accent">
        <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "relative mt-4 overflow-hidden rounded-2xl bg-surface-raised py-4",
          dimmed && "opacity-40",
        )}
      >
        <div ref={stripRef} className="flex will-change-transform px-3" style={{ gap: SLOT_GAP }}>
          {(spinning || previewSpinning ? extendedPlayers : players).map((player, index) => (
            <div
              key={`${player.user_id}-${index}`}
              ref={(node) => {
                slotRefs.current[index] = node;
              }}
              className="relative flex h-[56px] w-[56px] items-center justify-center"
              style={{ "--hl": 0 } as CSSProperties}
            >
              <PvpPlayerAvatar
                player={player}
                size={SLOT_SIZE}
                highlight={spinning ? "active" : "none"}
              />
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-surface-raised via-surface-raised/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-surface-raised via-surface-raised/70 to-transparent" />
      </div>
    </div>
  );
}

const SLOT_SIZE = 44;
const SLOT_GAP = 10;
const STRIP_PADDING_X = 12;

function getCenteredSlotPosition(offset: number, viewportWidth: number, totalSlots: number): number {
  const centerX = viewportWidth / 2 - offset - STRIP_PADDING_X - SLOT_SIZE / 2;
  const slot = centerX / (SLOT_SIZE + SLOT_GAP);
  return Math.max(0, Math.min(totalSlots - 1, slot));
}

function updateSlotHighlights(slots: (HTMLDivElement | null)[], centerPosition: number) {
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!slot) continue;
    slot.style.setProperty("--hl", highlightStrengthAtIndex(index, centerPosition).toFixed(3));
  }
}

function clearSlotHighlights(slots: (HTMLDivElement | null)[]) {
  for (const slot of slots) {
    slot?.style.setProperty("--hl", "0");
  }
}
