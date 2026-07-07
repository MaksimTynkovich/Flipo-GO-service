"use client";

import { useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { formatTON } from "@/lib/api";
import { PvpRoom, pvpPlayerName, pvpWinner } from "@/lib/pvp";

export function PvpOpenRoomCard({
  room,
  canJoin,
  joining,
  onJoin,
}: {
  room: PvpRoom;
  canJoin: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  const creator = room.players.find((player) => player.user_id === room.creator_id) ?? room.players[0];
  const opponent = room.players.find((player) => player.user_id !== room.creator_id);

  return (
    <article className="panel p-3">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0">
          {creator ? <PvpPlayerAvatar player={creator} size={40} /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5">{pvpPlayerName(creator)}</p>
          <p className="mt-1 text-sm font-semibold leading-5 tabular-nums text-foreground/85">
            <TonAmount
              amount={formatTON(room.bet_amount_nanoton)}
              variant="brand"
              iconClassName="h-3.5 w-3.5"
            />
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="size-9 shrink-0">
            {opponent ? (
              <PvpPlayerAvatar player={opponent} size={36} />
            ) : (
              <span className="flex size-full items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-surface-raised/40 text-muted/70">
                <Plus className="h-3.5 w-3.5" />
              </span>
            )}
          </div>

          {canJoin ? (
            <Button
              variant="accent"
              className="h-9 rounded-xl px-3.5 text-xs"
              disabled={joining}
              onClick={onJoin}
            >
              {joining ? "…" : "Войти"}
            </Button>
          ) : (
            <span className="chip shrink-0 whitespace-nowrap">Ожидание</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function PvpActiveRoomCard({ room }: { room: PvpRoom }) {
  const isCountdown = room.status === "countdown";
  const isSpinning = room.status === "spinning";
  const countdown = useCountdown(room.spin_at, isCountdown);

  return (
    <article className="panel overflow-hidden p-0">
      <div className="relative px-4 py-3">
        <PvpAvatarStrip
          players={room.players}
          winnerId={room.winner_id}
          spinning={isSpinning}
          previewSpinning={isCountdown}
          spinAt={room.spin_at}
          spinEndsAt={room.spin_ends_at}
          dimmed={isCountdown}
        />

        {isCountdown ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="text-2xl font-semibold leading-none tabular-nums text-foreground/90">
              {countdown}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PvpResultRoomCard({ room }: { room: PvpRoom }) {
  const winner = pvpWinner(room);
  const loser = room.players.find((player) => player.user_id !== room.winner_id);
  const payout = room.payout_nanoton ?? room.bet_amount_nanoton * room.player_count;

  return (
    <article className="panel p-3">
      <div className="flex items-center gap-3">
        <div className="relative size-10 shrink-0">
          {winner ? (
            <>
              <PvpPlayerAvatar player={winner} size={40} highlight="winner" />
              <span
                className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface"
                aria-hidden
              >
                <Trophy className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
            </>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5 text-accent">
            {winner ? pvpPlayerName(winner) : "—"}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="chip chip-accent shrink-0">Победа</span>
            <span className="min-w-0 truncate text-sm font-semibold leading-5 tabular-nums text-foreground/85">
              <TonAmount
                amount={formatTON(payout)}
                variant="brand"
                iconClassName="h-3.5 w-3.5"
              />
            </span>
          </div>
        </div>

        <div className="size-9 shrink-0">
          {loser ? (
            <PvpPlayerAvatar player={loser} size={36} className="opacity-40 grayscale" />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function useCountdown(targetAt?: string, active?: boolean) {
  const [value, setValue] = useState(3);

  useEffect(() => {
    if (!active || !targetAt) {
      setValue(3);
      return;
    }

    const update = () => {
      const diff = new Date(targetAt).getTime() - Date.now();
      setValue(Math.max(1, Math.ceil(diff / 1000)));
    };

    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [active, targetAt]);

  return value;
}
