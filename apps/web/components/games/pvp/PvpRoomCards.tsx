"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PvpAvatarStrip } from "@/components/games/pvp/PvpAvatarStrip";
import { PvpPlayerAvatar } from "@/components/games/pvp/PvpPlayerAvatar";
import { PvpStakeDetailSheet } from "@/components/games/pvp/PvpStakeDetailSheet";
import { TonAmount } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { PvpPlayer, PvpRoom, pvpPlayerName, pvpWinner } from "@/lib/pvp";
import { cn } from "@/lib/utils";

type StakeDetail = {
  player: PvpPlayer;
  stakeNanoton: number;
};

type RoomPhase = "open" | "live" | "result";

const PHASE_MS = 560;

function roomPhase(status: PvpRoom["status"]): RoomPhase {
  if (status === "finished") return "result";
  if (status === "countdown" || status === "spinning") return "live";
  return "open";
}

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

/** Crossfades open → live → result inside a fixed slot. */
export function PvpRoomCardView({
  room,
  userId,
  joining,
  onJoin,
  onProof,
}: {
  room: PvpRoom;
  userId?: string;
  joining: boolean;
  onJoin: () => void;
  onProof?: () => void;
}) {
  const phase = roomPhase(room.status);
  const [shownPhase, setShownPhase] = useState<RoomPhase>(phase);
  const [outgoing, setOutgoing] = useState<RoomPhase | null>(null);
  const [outgoingRoom, setOutgoingRoom] = useState<PvpRoom | null>(null);
  const [flash, setFlash] = useState<"live" | "result" | null>(null);
  const prevRoomRef = useRef(room);

  useEffect(() => {
    if (phase === shownPhase) {
      prevRoomRef.current = room;
      return;
    }

    setOutgoing(shownPhase);
    setOutgoingRoom(prevRoomRef.current);
    setShownPhase(phase);
    setFlash(phase === "open" ? null : phase);
    prevRoomRef.current = room;

    const clearOut = window.setTimeout(() => {
      setOutgoing(null);
      setOutgoingRoom(null);
    }, PHASE_MS);
    const clearFlash = window.setTimeout(() => setFlash(null), PHASE_MS + 80);
    return () => {
      window.clearTimeout(clearOut);
      window.clearTimeout(clearFlash);
    };
  }, [phase, shownPhase, room]);

  const renderPhase = (target: RoomPhase, data: PvpRoom) => {
    if (target === "result") {
      return <PvpResultRoomCard room={data} onProof={onProof} />;
    }
    if (target === "live") {
      return <PvpActiveRoomCard room={data} />;
    }
    return (
      <PvpOpenRoomCard
        room={data}
        canJoin={
          !data.players.some((player) => player.user_id === userId) &&
          data.creator_id !== userId
        }
        joining={joining}
        onJoin={onJoin}
      />
    );
  };

  return (
    <div
      className={cn(
        "pvp-room-morph",
        outgoing && "pvp-room-morph--busy",
        flash === "live" && "pvp-room-morph--flash-live",
        flash === "result" && "pvp-room-morph--flash-result",
      )}
    >
      {outgoing && outgoingRoom ? (
        <div className="pvp-room-morph__layer pvp-room-morph__layer--out" aria-hidden>
          {renderPhase(outgoing, outgoingRoom)}
        </div>
      ) : null}
      <div
        className={cn(
          "pvp-room-morph__layer",
          outgoing ? "pvp-room-morph__layer--in" : "pvp-room-morph__layer--solo",
        )}
      >
        {renderPhase(shownPhase, room)}
      </div>
      {flash ? <span className="pvp-room-morph__burst" aria-hidden /> : null}
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
  const stakeDetail = useStakeDetail();
  const creator = room.players.find((player) => player.user_id === room.creator_id) ?? room.players[0];
  const opponent = room.players.find((player) => player.user_id !== room.creator_id);
  const creatorStake = playerStakeNanoton(creator, room);
  const pot = room.players.reduce((sum, p) => sum + playerStakeNanoton(p, room), 0);
  const allowJoin = canJoin;

  return (
    <>
      <article className="pvp-room pvp-room--open">
        <div className="pvp-room__glow" aria-hidden />

        <div className="pvp-room__duel">
          <div className="pvp-room__fighter">
            <div className="pvp-room__avatar pvp-room__avatar--a">
              {creator ? <PvpPlayerAvatar player={creator} size={40} /> : null}
            </div>
            <p className="pvp-room__name">{pvpPlayerName(creator)}</p>
          </div>

          <div className="pvp-room__vs" aria-hidden>
            <Swords className="h-3.5 w-3.5" strokeWidth={2.4} />
            <span>VS</span>
          </div>

          <div className="pvp-room__fighter">
            <div className={cn("pvp-room__avatar", opponent ? "pvp-room__avatar--b" : "pvp-room__avatar--empty")}>
              {opponent ? (
                <PvpPlayerAvatar player={opponent} size={40} />
              ) : (
                <span className="pvp-room__slot">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
              )}
            </div>
            <p className="pvp-room__name">
              {opponent ? pvpPlayerName(opponent) : "Свободно"}
            </p>
          </div>
        </div>

        <div className="pvp-room__footer">
          <button
            type="button"
            className="pvp-room__pot"
            onClick={() => {
              if (creator) stakeDetail.open(creator, creatorStake);
            }}
            disabled={!creator}
          >
            <span className="pvp-room__pot-label">Банк</span>
            <span className="pvp-room__pot-value">
              <TonAmount amount={formatTON(pot)} variant="brand" iconSize="sm" iconClassName="h-3.5 w-3.5" />
            </span>
          </button>

          {allowJoin ? (
            <Button
              variant="accent"
              className="pvp-room__join h-8 shrink-0 rounded-lg px-3.5 text-xs font-bold"
              disabled={joining}
              onClick={onJoin}
            >
              {joining ? "…" : "Войти в бой"}
            </Button>
          ) : (
            <span className="pvp-room__status">Ваша комната</span>
          )}
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
    <article
      className={cn(
        "pvp-room pvp-room--live",
        isCountdown && "pvp-room--countdown",
        isSpinning && "pvp-room--spinning",
      )}
    >
      <div className="pvp-room__glow" aria-hidden />

      <div className="pvp-room__stage">
        <PvpAvatarStrip
          players={room.players}
          winnerId={room.winner_id}
          spinning={isSpinning}
          previewSpinning={isCountdown}
          spinAt={room.spin_at}
          spinEndsAt={room.spin_ends_at}
          dimmed={isCountdown}
          className="pvp-room__strip"
        />
        {isCountdown ? (
          <div className="pvp-countdown pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div
              className={cn(
                "pvp-countdown__ring",
                countdown <= 2 && "pvp-countdown__ring--urgent",
              )}
            >
              <span key={countdown} className="pvp-countdown__value">
                {countdown}
              </span>
            </div>
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
    <article className="pvp-room pvp-room--result">
      <div className="pvp-room__glow" aria-hidden />
      <div className="pvp-room__stage">
        <PvpAvatarStrip players={room.players} winnerId={room.winner_id} settled />
        <div className="pvp-room__result">
          <div className="min-w-0">
            <p className="pvp-room__result-label">Победитель</p>
            <p className="pvp-room__result-name truncate">
              {winner ? pvpPlayerName(winner) : "—"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="pvp-room__result-payout">
              <TonAmount
                amount={`+${formatTON(payout)}`}
                variant="brand"
                iconClassName="h-3.5 w-3.5"
              />
            </span>
            {room.game_round_id && onProof ? (
              <button type="button" className="pvp-room__proof" onClick={onProof}>
                Проверить
              </button>
            ) : null}
          </div>
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
