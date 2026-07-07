"use client";

import { useEffect, useState } from "react";
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
  const dimOpacity = highlight === "active" ? 0.52 + activeStrength * 0.48 : 1;
  const dimScale = highlight === "active" ? 0.94 + activeStrength * 0.06 : 1;

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-surface-raised transition-[box-shadow,filter,opacity,transform] duration-150 ease-out",
        highlight === "winner" &&
          "shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_28%,transparent),0_0_24px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        opacity: dimOpacity,
        transform: `scale(${dimScale})`,
        filter:
          highlight === "active"
            ? `saturate(${0.7 + activeStrength * 0.45}) brightness(${0.72 + activeStrength * 0.34})`
            : undefined,
        boxShadow:
          highlight === "active"
            ? `0 0 0 ${1 + activeStrength}px color-mix(in srgb, var(--accent) ${10 + activeStrength * 18}%, transparent), 0 0 ${14 + activeStrength * 22}px color-mix(in srgb, var(--accent) ${8 + activeStrength * 16}%, transparent)`
            : undefined,
      }}
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
