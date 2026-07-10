"use client";

import { useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PvpClickableStake } from "@/components/games/pvp/PvpClickableStake";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { PvpStakeDetailSheet } from "@/components/games/pvp/PvpStakeDetailSheet";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { PvpPlayer, PvpRoom, pvpPlayerName, pvpWinner } from "@/lib/pvp";
import { formatWinChanceBps } from "@/lib/pvp-stake";

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
  const stakeDetail = useStakeDetail();
  const isCountdown = room.status === "countdown";
  const isSpinning = room.status === "spinning";
  const countdown = useCountdown(room.spin_at, isCountdown);

  return (
    <>
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

        {room.players.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-2">
            {room.players.map((player) => (
              <div key={player.user_id} className="flex justify-center">
                <PvpClickableStake
                  player={player}
                  amountNanoton={playerStakeNanoton(player, room)}
                  iconSize="xs"
                  onOpen={stakeDetail.open}
                />
              </div>
            ))}
          </div>
        ) : null}

        {room.players.length >= 2 && room.players.some((p) => p.win_chance_bps) ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-2 text-[10px] text-muted">
            {room.players.map((player) => (
              <span key={player.user_id} className="truncate text-center">
                {player.win_chance_bps ? `${formatWinChanceBps(player.win_chance_bps)}` : "—"}
              </span>
            ))}
          </div>
        ) : null}
      </article>

      <StakeDetailModal detail={stakeDetail.detail} onClose={stakeDetail.close} />
    </>
  );
}

export function PvpResultRoomCard({
  room,
  onProof,
}: {
  room: PvpRoom;
  onProof?: () => void;
}) {
  const stakeDetail = useStakeDetail();
  const winner = pvpWinner(room);
  const loser = room.players.find((player) => player.user_id !== room.winner_id);
  const payout = room.payout_nanoton ?? room.bet_amount_nanoton * room.player_count;

  return (
    <>
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
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="chip chip-accent shrink-0">Победа</span>
              <span className="min-w-0 truncate text-sm font-semibold leading-5 tabular-nums text-foreground/85">
                <TonAmount
                  amount={formatTON(payout)}
                  variant="brand"
                  iconClassName="h-3.5 w-3.5"
                />
              </span>
            </div>
            {winner ? (
              <p className="mt-1 text-xs text-muted">
                Ставка:{" "}
                <PvpClickableStake
                  player={winner}
                  amountNanoton={playerStakeNanoton(winner, room)}
                  iconSize="xs"
                  onOpen={stakeDetail.open}
                />
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="size-9 shrink-0">
              {loser ? (
                <PvpPlayerAvatar player={loser} size={36} className="opacity-40 grayscale" />
              ) : null}
            </div>
            {loser ? (
              <PvpClickableStake
                player={loser}
                amountNanoton={playerStakeNanoton(loser, room)}
                iconSize="xs"
                className="max-w-[4.5rem] justify-center opacity-70"
                onOpen={stakeDetail.open}
              />
            ) : null}
          </div>
        </div>
        {room.game_round_id && onProof ? (
          <button type="button" className="mt-2 text-xs text-accent" onClick={onProof}>
            Проверить честность
          </button>
        ) : null}
      </article>

      <StakeDetailModal detail={stakeDetail.detail} onClose={stakeDetail.close} />
    </>
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
