"use client";

import { PvpPlayer } from "@/lib/pvp";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus } from "lucide-react";

type Props = {
  players: PvpPlayer[];
  winnerId?: string;
  dimmed?: boolean;
  showEmptySlot?: boolean;
  className?: string;
};

export function PvpDuelRow({
  players,
  winnerId,
  dimmed = false,
  showEmptySlot = false,
  className,
}: Props) {
  const [left, right] = players;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center gap-5 py-4",
        dimmed && "opacity-60",
        className,
      )}
    >
      <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 text-accent">
        <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
      </div>

      {left ? (
        <PvpPlayerAvatar
          player={left}
          size={48}
          highlight={winnerId === left.user_id ? "winner" : "none"}
        />
      ) : (
        <EmptySlot />
      )}

      {right ? (
        <PvpPlayerAvatar
          player={right}
          size={48}
          highlight={winnerId === right.user_id ? "winner" : "none"}
        />
      ) : showEmptySlot ? (
        <EmptySlot />
      ) : null}
    </div>
  );
}

function EmptySlot() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-surface-raised/50 text-muted">
      <Plus className="h-4 w-4" />
    </span>
  );
}
