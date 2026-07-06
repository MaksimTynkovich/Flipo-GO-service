"use client";

import { useEffect, useState } from "react";
import { PvpPlayer, pvpPlayerName } from "@/lib/pvp";
import { cn } from "@/lib/utils";
import { User as UserIcon } from "lucide-react";

type Props = {
  player: PvpPlayer;
  size?: number;
  className?: string;
  highlight?: "winner" | "none";
};

export function PvpPlayerAvatar({ player, size = 40, className, highlight = "none" }: Props) {
  const [imgError, setImgError] = useState(false);
  const initial = (player.first_name?.[0] || player.username?.[0] || "?").toUpperCase();

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-surface-raised ring-1 ring-[var(--border)]",
        highlight === "winner" &&
          "ring-2 ring-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]",
        className,
      )}
      style={{ width: size, height: size }}
      title={pvpPlayerName(player)}
    >
      {player.photo_url && !imgError ? (
        <img
          src={player.photo_url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-foreground">
          {initial !== "?" ? initial : <UserIcon style={{ width: size * 0.45, height: size * 0.45 }} />}
        </span>
      )}
    </span>
  );
}
