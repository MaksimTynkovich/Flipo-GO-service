"use client";

import { useEffect, useRef, useState } from "react";
import { PvpRoom } from "@/lib/pvp";
import { PvpResultRoomCard } from "@/components/games/pvp/PvpRoomCards";
import { cn } from "@/lib/utils";

export const PVP_RESULT_VISIBLE_MS = 10_000;
const EXIT_MS = 420;

type Props = {
  history: PvpRoom[];
  onProof?: (room: PvpRoom) => void;
};

/**
 * Shows finished rooms for 10s after finished_at, then slides them away.
 */
export function PvpRecentResults({ history, onProof }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set());
  const [goneIds, setGoneIds] = useState<Set<string>>(() => new Set());
  const exitTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => {
      window.clearInterval(timer);
      for (const id of Array.from(exitTimers.current.values())) {
        window.clearTimeout(id);
      }
      exitTimers.current.clear();
    };
  }, []);

  const visible = history.filter((room) => {
    if (goneIds.has(room.id)) return false;
    if (!room.finished_at) return false;
    const age = now - new Date(room.finished_at).getTime();
    if (Number.isNaN(age)) return false;
    // Keep while fresh or while exit animation plays
    return age < PVP_RESULT_VISIBLE_MS || leavingIds.has(room.id);
  });

  useEffect(() => {
    for (const room of history) {
      if (goneIds.has(room.id) || leavingIds.has(room.id) || !room.finished_at) continue;
      const age = now - new Date(room.finished_at).getTime();
      if (Number.isNaN(age) || age < PVP_RESULT_VISIBLE_MS) continue;

      setLeavingIds((prev) => {
        if (prev.has(room.id)) return prev;
        const next = new Set(prev);
        next.add(room.id);
        return next;
      });

      if (!exitTimers.current.has(room.id)) {
        const timer = window.setTimeout(() => {
          exitTimers.current.delete(room.id);
          setGoneIds((prev) => new Set(prev).add(room.id));
          setLeavingIds((prev) => {
            const next = new Set(prev);
            next.delete(room.id);
            return next;
          });
        }, EXIT_MS);
        exitTimers.current.set(room.id, timer);
      }
    }
  }, [history, now, leavingIds, goneIds]);

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((room) => (
        <div
          key={room.id}
          className={cn(
            "pvp-room-enter",
            leavingIds.has(room.id) && "pvp-room-exit",
          )}
        >
          <PvpResultRoomCard
            room={room}
            onProof={
              room.game_round_id && onProof ? () => onProof(room) : undefined
            }
          />
        </div>
      ))}
    </>
  );
}

export function hasRecentPvpResults(history: PvpRoom[], now = Date.now()): boolean {
  return history.some((room) => {
    if (!room.finished_at) return false;
    const age = now - new Date(room.finished_at).getTime();
    return !Number.isNaN(age) && age < PVP_RESULT_VISIBLE_MS;
  });
}
