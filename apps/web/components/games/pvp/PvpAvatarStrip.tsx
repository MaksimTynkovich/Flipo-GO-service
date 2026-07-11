"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { PvpPlayer } from "@/lib/pvp";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { highlightStrengthAtIndex } from "@/lib/pvp-highlight";
import {
  computeSpinOffsets,
  PVP_LAND_CYCLE,
  PVP_STRIP_COMPACT,
  type PvpStripMetrics,
  spinOffsetAtTime,
  spinTimeProgress,
} from "@/lib/pvp-spin";
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
  settled?: boolean;
  className?: string;
};

const METRICS: PvpStripMetrics = PVP_STRIP_COMPACT;

export function PvpAvatarStrip({
  players,
  winnerId,
  spinning = false,
  previewSpinning = false,
  spinAt,
  spinEndsAt,
  dimmed = false,
  settled = false,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [landed, setLanded] = useState(false);

  const playerKey = useMemo(
    () => players.map((player) => player.user_id).join(":"),
    [players],
  );

  const extendedPlayers = useMemo(() => {
    if (players.length === 0) return [];
    const repeats = PVP_LAND_CYCLE + 8;
    return Array.from({ length: repeats }, () => players).flat();
  }, [playerKey, players]);

  const showExtended = spinning || previewSpinning || settled;

  const winnerIndex = useMemo(
    () => (winnerId ? players.findIndex((player) => player.user_id === winnerId) : -1),
    [players, winnerId],
  );
  const landIndex =
    winnerIndex >= 0 ? PVP_LAND_CYCLE * players.length + winnerIndex : -1;

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
    setLanded(false);
  }, [spinAt, winnerId, spinning]);

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

    const step = METRICS.slotSize + METRICS.slotGap;
    const localWinnerIndex = winnerId
      ? players.findIndex((player) => player.user_id === winnerId)
      : -1;

    if (settled && localWinnerIndex >= 0) {
      const { targetOffset } = computeSpinOffsets(
        localWinnerIndex,
        players.length,
        viewportWidth,
        METRICS,
      );
      strip.style.transform = `translateX(${targetOffset}px)`;
      updateSlotHighlights(
        slotRefs.current,
        getCenteredSlotPosition(targetOffset, viewportWidth, extendedPlayers.length, METRICS),
      );
      setLanded(true);
      return;
    }

    if (!spinning || localWinnerIndex < 0 || !spinAt || !spinEndsAt) {
      if (previewSpinning) {
        const previewIndex = players.length * Math.floor(PVP_LAND_CYCLE / 2);
        const previewOffset =
          -(previewIndex * step) +
          (viewportWidth / 2 - METRICS.slotSize / 2 - METRICS.stripPaddingX);
        strip.style.transform = `translateX(${previewOffset}px)`;
        updateSlotHighlights(
          slotRefs.current,
          getCenteredSlotPosition(previewOffset, viewportWidth, extendedPlayers.length, METRICS),
        );
      } else {
        strip.style.transform = "translateX(0px)";
        clearSlotHighlights(slotRefs.current);
      }
      return;
    }

    const { targetOffset } = computeSpinOffsets(
      localWinnerIndex,
      players.length,
      viewportWidth,
      METRICS,
    );
    const spinAtMs = new Date(spinAt).getTime();
    const spinEndsAtMs = new Date(spinEndsAt).getTime();

    const frame = () => {
      const now = Date.now();
      const timeProgress = spinTimeProgress(now, spinAtMs, spinEndsAtMs);
      const offset = spinOffsetAtTime(timeProgress, targetOffset);
      strip.style.transform = `translateX(${offset}px)`;
      updateSlotHighlights(
        slotRefs.current,
        getCenteredSlotPosition(offset, viewportWidth, extendedPlayers.length, METRICS),
      );

      if (timeProgress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
        setLanded(true);
      }
    };

    frame();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    spinning,
    previewSpinning,
    settled,
    winnerId,
    spinAt,
    spinEndsAt,
    viewportWidth,
    playerKey,
    players.length,
    extendedPlayers.length,
  ]);

  if (players.length === 0) {
    return null;
  }

  const highlightMode = spinning || previewSpinning || settled ? "active" : "none";

  return (
    <div
      ref={viewportRef}
      className={cn(
        "pvp-strip relative w-full overflow-hidden",
        dimmed && "pvp-strip--dimmed",
        className,
      )}
    >
      <div className="pvp-strip__pointer pointer-events-none" aria-hidden>
        <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
      </div>

      <div
        ref={stripRef}
        className="pvp-strip__track flex w-max will-change-transform"
        style={{
          gap: METRICS.slotGap,
          paddingLeft: METRICS.stripPaddingX,
          paddingRight: METRICS.stripPaddingX,
        }}
      >
        {(showExtended ? extendedPlayers : players).map((player, index) => {
          const isWinnerSlot = landed && landIndex >= 0 && index === landIndex;
          return (
            <div
              key={`${player.user_id}-${index}`}
              ref={(node) => {
                slotRefs.current[index] = node;
              }}
              className="relative flex shrink-0 items-center justify-center"
              style={
                {
                  width: METRICS.slotSize,
                  height: METRICS.slotSize,
                  minWidth: METRICS.slotSize,
                  "--hl": 0,
                } as CSSProperties
              }
            >
              <PvpPlayerAvatar
                player={player}
                size={METRICS.avatarSize}
                highlight={isWinnerSlot ? "winner" : highlightMode}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getCenteredSlotPosition(
  offset: number,
  viewportWidth: number,
  totalSlots: number,
  metrics: PvpStripMetrics,
): number {
  const step = metrics.slotSize + metrics.slotGap;
  const centerX = viewportWidth / 2 - offset - metrics.stripPaddingX - metrics.slotSize / 2;
  const slot = centerX / step;
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
