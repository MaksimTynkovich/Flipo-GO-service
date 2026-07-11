"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PvpClickableStake } from "@/components/games/pvp/PvpClickableStake";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { PvpStakeDetailSheet } from "@/components/games/pvp/PvpStakeDetailSheet";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { PvpPlayer, PvpRoom, pvpPlayerName, pvpWinner } from "@/lib/pvp";

type StakeDetail = {
  player: PvpPlayer;
  stakeNanoton: number;
};

function useStakeDetail() {
  const [detail, setDetail] = useState<StakeDetail | null>(null);
  return {
    detail,
    open: (player: PvpPlayer, stakeNanoton: number) => setDetail({ player, stakeNanoton }),
    close: () => setDetail(null),
  };
}

function playerStakeNanoton(player: PvpPlayer | undefined, room: PvpRoom): number {
  return player?.stake_nanoton ?? room.bet_amount_nanoton;
}

function StakeDetailModal({
  detail,
  onClose,
}: {
  detail: StakeDetail | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  return (
    <PvpStakeDetailSheet
      player={detail.player}
      stakeNanoton={detail.stakeNanoton}
      onClose={onClose}
    />
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
  const stakeDetail = useStakeDetail();
  const creator = room.players.find((player) => player.user_id === room.creator_id) ?? room.players[0];
  const opponent = room.players.find((player) => player.user_id !== room.creator_id);
  const creatorStake = playerStakeNanoton(creator, room);
  const opponentStake = opponent ? playerStakeNanoton(opponent, room) : null;

  return (
    <>
      <article className="app-control interactive-card panel p-3">
        <div className="flex items-center gap-3">
          <div className="size-10 shrink-0">
            {creator ? <PvpPlayerAvatar player={creator} size={40} /> : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-5">{pvpPlayerName(creator)}</p>
            <p className="mt-1 text-sm font-semibold leading-5 tabular-nums text-foreground/85">
              {creator ? (
                <PvpClickableStake
                  player={creator}
                  amountNanoton={creatorStake}
                  iconSize="sm"
                  onOpen={stakeDetail.open}
                />
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className="size-9 shrink-0">
                {opponent ? (
                  <PvpPlayerAvatar player={opponent} size={36} />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-surface-raised/40 text-muted/70">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              {opponent && opponentStake != null ? (
                <PvpClickableStake
                  player={opponent}
                  amountNanoton={opponentStake}
                  iconSize="xs"
                  className="max-w-[4.5rem] justify-center"
                  onOpen={stakeDetail.open}
                />
              ) : null}
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

      <StakeDetailModal detail={stakeDetail.detail} onClose={stakeDetail.close} />
    </>
  );
}

export function PvpActiveRoomCard({ room }: { room: PvpRoom }) {
  const isCountdown = room.status === "countdown";
  const isSpinning = room.status === "spinning";
  const countdown = useCountdown(room.spin_at, isCountdown);

  return (
    <article className="panel p-3">
      <div className="relative">
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
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {countdown}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PvpResultRoomCard({
  room,
  onProof,
}: {
  room: PvpRoom;
  onProof?: () => void;
}) {
  const winner = pvpWinner(room);
  const payout = room.payout_nanoton ?? room.bet_amount_nanoton * room.player_count;

  return (
    <article className="panel p-3">
      <PvpAvatarStrip players={room.players} winnerId={room.winner_id} settled />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted">
          {winner ? pvpPlayerName(winner) : "—"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-success">
            <TonAmount
              amount={`+${formatTON(payout)}`}
              variant="brand"
              iconClassName="h-3.5 w-3.5"
            />
          </span>
          {room.game_round_id && onProof ? (
            <button
              type="button"
              className="text-[11px] font-medium text-accent"
              onClick={onProof}
            >
              Проверить
            </button>
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
