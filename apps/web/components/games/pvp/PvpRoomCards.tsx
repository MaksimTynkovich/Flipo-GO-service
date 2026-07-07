"use client";

import { useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpDuelRow } from "@/components/games/pvp/PvpDuelRow";
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
    <article className="panel flex items-center gap-3 p-3">
      {creator && <PvpPlayerAvatar player={creator} size={40} />}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pvpPlayerName(creator)}</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground/85">
          <TonAmount
            amount={formatTON(room.bet_amount_nanoton)}
            variant="brand"
            iconClassName="h-3.5 w-3.5"
          />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {opponent ? (
          <PvpPlayerAvatar player={opponent} size={36} />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-surface-raised/40 text-muted/70">
            <Plus className="h-3.5 w-3.5" />
          </span>
        )}

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
          <span className="chip shrink-0">Ожидание</span>
        )}
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
      <div className="flex items-center justify-center px-4 py-2">
        <span className="chip chip-accent">
          {isCountdown ? "До старта" : "Определяем победителя…"}
        </span>
      </div>

      <div className="relative px-4 pb-3">
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
  const payout = room.payout_nanoton ?? room.bet_amount_nanoton * room.player_count;

  return (
    <article className="panel overflow-hidden p-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Trophy className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-muted">Победитель игры</p>
            <p className="truncate text-sm font-semibold text-[var(--link)]">
              {winner ? pvpPlayerName(winner) : "—"}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted">Сумма выигрыша</p>
          <p className="mt-0.5 text-sm font-bold text-success">
            <TonAmount amount={formatTON(payout)} variant="brand" iconClassName="h-4 w-4" />
          </p>
        </div>
      </div>

      <div className="bg-surface-raised/35 px-4">
        <PvpDuelRow players={room.players} winnerId={room.winner_id} />
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
