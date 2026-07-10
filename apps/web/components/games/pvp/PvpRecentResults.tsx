"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { PvpRoom } from "@/lib/pvp";
import { cn } from "@/lib/utils";

export const PVP_RESULT_VISIBLE_MS = 10_000;
const EXIT_MS = 420;

/**
 * Finished rooms still shown (within 10s) or mid exit animation.
 */
export function usePvpFinishedVisibility(history: PvpRoom[]) {
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

  const recentById = new Map<string, PvpRoom>();
  for (const room of history) {
    if (goneIds.has(room.id) || !room.finished_at) continue;
    const age = now - new Date(room.finished_at).getTime();
    if (Number.isNaN(age)) continue;
    if (age < PVP_RESULT_VISIBLE_MS || leavingIds.has(room.id)) {
      recentById.set(room.id, room);
    }
  }

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

  return {
    recentById,
    leavingIds,
    goneIds,
    hasRecent: recentById.size > 0,
  };
}

export function PvpRoomExitShell({
  leaving,
  children,
}: {
  leaving?: boolean;
  children: ReactNode;
}) {
  return <div className={cn(leaving && "pvp-room-exit")}>{children}</div>;
}

export function hasRecentPvpResults(history: PvpRoom[], now = Date.now()): boolean {
  return history.some((room) => {
    if (!room.finished_at) return false;
    const age = now - new Date(room.finished_at).getTime();
    return !Number.isNaN(age) && age < PVP_RESULT_VISIBLE_MS;
  });
}
