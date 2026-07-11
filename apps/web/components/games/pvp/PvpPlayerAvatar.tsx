"use client";

import { useState } from "react";
import { PvpPlayer, pvpPlayerName } from "@/lib/pvp";
import { cn } from "@/lib/utils";
import { User as UserIcon } from "lucide-react";

type Props = {
  player: PvpPlayer;
  size?: number;
  className?: string;
  highlight?: "winner" | "active" | "none";
  highlightStrength?: number;
};

export function PvpPlayerAvatar({
  player,
  size = 40,
  className,
  highlight = "none",
  highlightStrength = 0,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const initial = (player.first_name?.[0] || player.username?.[0] || "?").toUpperCase();
  const activeStrength = Math.max(0, Math.min(1, highlightStrength));
  const useCssVar = highlight === "active" && highlightStrength === 0;
  const strength = useCssVar ? undefined : activeStrength;

  return (
    <span
      className={cn(
        "pvp-player-avatar relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-raised",
        highlight === "active" && "pvp-player-avatar--active",
        highlight === "winner" && "ring-1 ring-accent/70",
        className,
      )}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        ...(highlight === "active" && !useCssVar
          ? activeHighlightStyle(strength ?? 0)
          : undefined),
      }}
      title={pvpPlayerName(player)}
    >
      {player.photo_url && !imgError ? (
        <img
          src={player.photo_url}
          alt=""
          className="block h-full w-full object-cover"
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

function activeHighlightStyle(strength: number) {
  return {
    opacity: 0.52 + strength * 0.48,
    transform: `scale(${0.94 + strength * 0.06})`,
    filter: `saturate(${0.7 + strength * 0.45}) brightness(${0.72 + strength * 0.34})`,
    boxShadow: `0 0 0 ${1 + strength}px color-mix(in srgb, var(--accent) ${20 + strength * 30}%, transparent)`,
  };
}
