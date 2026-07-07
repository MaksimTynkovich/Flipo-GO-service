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
    <article className="panel overflow-hidden p-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-stretch bg-[linear-gradient(180deg,rgba(19,25,40,0.96),rgba(24,31,49,0.96))]">
        <div className="flex min-w-0 items-center gap-3 border-r border-[var(--border)] px-4 py-4">
          {creator && <PvpPlayerAvatar player={creator} size={44} />}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground/95">{pvpPlayerName(creator)}</p>
            <div className="mt-1 text-[1.05rem] font-semibold tabular-nums text-[#d6a07f]">
              <TonAmount amount={formatTON(room.bet_amount_nanoton)} variant="brand" iconClassName="h-4 w-4" />
            </div>
            <p className="mt-0.5 text-[11px] text-muted">Ставка в игру</p>
          </div>
        </div>

        <div className="flex items-center justify-center border-r border-[var(--border)] px-5 py-3">
          {opponent ? (
            <PvpPlayerAvatar player={opponent} size={44} />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-surface-raised/35 text-muted">
              <Plus className="h-4 w-4" />
            </span>
          )}
        </div>

        <div className="flex items-center px-3 py-3">
          {canJoin ? (
            <Button
              variant="accent"
              className="h-11 rounded-2xl px-5 text-xs font-bold uppercase tracking-wide shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
              disabled={joining}
              onClick={onJoin}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {joining ? "…" : "Войти"}
            </Button>
          ) : (
            <span className="px-2 text-[11px] font-medium text-muted">Ожидание</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function PvpActiveRoomCard({ room }: { room: PvpRoom }) {
  const isSpinning = room.status === "spinning";
  const countdown = useCountdown(room.spin_at, room.status === "countdown");

  return (
    <article className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-surface-raised/40 px-4 py-2.5">
        <p className="text-center text-[11px] font-medium text-muted">
          {room.status === "countdown" ? "До старта игры" : "Определяем победителя…"}
        </p>
      </div>

      {isSpinning ? (
        <div className="px-4 py-3">
          <PvpAvatarStrip
            players={room.players}
            winnerId={room.winner_id}
            spinning
            spinAt={room.spin_at}
            spinEndsAt={room.spin_ends_at}
          />
        </div>
      ) : (
        <div className="px-4 py-4">
          <PvpDuelRow players={room.players} dimmed className="px-0 py-3" />
          <div className="mt-2 flex items-center justify-center">
            <span className="inline-flex min-w-12 items-center justify-center rounded-2xl bg-accent/15 px-4 py-2 text-lg font-semibold tabular-nums text-accent">
              {countdown}
            </span>
          </div>
        </div>
      )}
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
