"use client";

import { Plus, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TonAmount } from "@/components/icons/TonIcon";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { formatTON } from "@/lib/api";
import { PvpRoom, pvpPlayerName, pvpWinner } from "@/lib/pvp";
import { cn } from "@/lib/utils";

function RoomSection({
  children,
  className,
  skew,
}: {
  children: React.ReactNode;
  className?: string;
  skew?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center px-3 py-3",
        skew === "left" &&
          "before:absolute before:inset-y-0 before:-right-3 before:w-6 before:skew-x-[-12deg] before:bg-surface-raised/80",
        skew === "right" &&
          "before:absolute before:inset-y-0 before:-left-3 before:w-6 before:skew-x-[-12deg] before:bg-surface-raised/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
  const emptySlots = Math.max(room.max_players - room.player_count, 0);

  return (
    <article className="panel flex overflow-hidden p-0">
      <RoomSection className="flex-[1.05] gap-2.5 bg-surface" skew="left">
        {creator && <PvpPlayerAvatar player={creator} size={42} className="rounded-xl" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{pvpPlayerName(creator)}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            <TonAmount amount={formatTON(room.bet_amount_nanoton)} variant="brand" iconClassName="h-3.5 w-3.5" />
          </p>
          <p className="text-[10px] text-muted/80">Ставка в игру</p>
        </div>
      </RoomSection>

      <RoomSection className="flex-[1.15] justify-center gap-2 bg-surface-raised/55">
        {room.players
          .filter((player) => player.user_id !== room.creator_id)
          .map((player) => (
            <PvpPlayerAvatar key={player.user_id} player={player} size={36} />
          ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <span
            key={`empty-${index}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-surface/40 text-muted"
          >
            <Plus className="h-3.5 w-3.5" />
          </span>
        ))}
      </RoomSection>

      <RoomSection className="flex-none bg-surface-raised/80 pl-2 pr-2">
        {canJoin ? (
          <Button
            variant="accent"
            className="h-11 min-w-[5.5rem] rounded-xl px-4 text-xs font-bold uppercase tracking-wide shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
            disabled={joining}
            onClick={onJoin}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {joining ? "…" : "Войти"}
          </Button>
        ) : (
          <span className="px-2 text-[11px] font-medium text-muted">В комнате</span>
        )}
      </RoomSection>
    </article>
  );
}

export function PvpActiveRoomCard({ room }: { room: PvpRoom }) {
  const isSpinning = room.status === "spinning";

  return (
    <article className="panel overflow-hidden p-0">
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-center text-[11px] font-medium text-muted">
          {room.status === "countdown" ? "Рулетка скоро начнётся…" : "Определяем победителя…"}
        </p>
      </div>
      <div className="px-3 py-3">
        <PvpAvatarStrip
          players={room.players}
          winnerId={isSpinning ? room.winner_id : undefined}
          spinning={isSpinning}
          spinEndsAt={room.spin_ends_at}
          dimmed={room.status === "countdown"}
        />
      </div>
    </article>
  );
}

export function PvpResultRoomCard({ room }: { room: PvpRoom }) {
  const winner = pvpWinner(room);
  const payout = room.payout_nanoton ?? room.bet_amount_nanoton * room.player_count;

  return (
    <article className="panel flex overflow-hidden p-0">
      <RoomSection className="flex-[0.95] gap-2.5 bg-surface" skew="left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Trophy className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted">Победитель игры</p>
          <p className="truncate text-sm font-semibold text-[var(--link)]">
            {winner ? pvpPlayerName(winner) : "—"}
          </p>
        </div>
      </RoomSection>

      <RoomSection className="flex-[1.2] bg-surface-raised/55 px-2 py-2">
        <PvpAvatarStrip players={room.players} winnerId={room.winner_id} />
      </RoomSection>

      <RoomSection className="flex-none gap-2 bg-surface-raised/80 pr-3">
        <div className="text-right">
          <p className="text-[10px] text-muted">Сумма выигрыша</p>
          <p className="mt-0.5 text-sm font-bold text-success">
            <TonAmount amount={formatTON(payout)} variant="brand" iconClassName="h-3.5 w-3.5" />
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted">
          <Wallet className="h-4 w-4" />
        </span>
      </RoomSection>
    </article>
  );
}
