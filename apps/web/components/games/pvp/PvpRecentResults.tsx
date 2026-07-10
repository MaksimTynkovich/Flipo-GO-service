"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { PvpRoom } from "@/lib/pvp";
import { cn } from "@/lib/utils";

/** Must match backend HistoryVisibleSeconds */
export const PVP_RESULT_VISIBLE_MS = 10_000;
const EXIT_MS = 420;

/**
 * Finished rooms from lobby history (backend already keeps ≤10s).
 * When a room drops out of the next lobby payload, play a short exit once.
 */
export function usePvpFinishedVisibility(history: PvpRoom[]) {
  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set());
  const [goneIds, setGoneIds] = useState<Set<string>>(() => new Set());
  const exitTimers = useRef<Map<string, number>>(new Map());
  const snapshots = useRef<Map<string, PvpRoom>>(new Map());
  const prevHistoryIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    return () => {
      for (const id of Array.from(exitTimers.current.values())) {
        window.clearTimeout(id);
      }
      exitTimers.current.clear();
    };
  }, []);

  for (const room of history) {
    snapshots.current.set(room.id, room);
  }

  const recentById = new Map<string, PvpRoom>();
  for (const room of history) {
    if (goneIds.has(room.id)) continue;
    recentById.set(room.id, room);
  }
  for (const id of Array.from(leavingIds)) {
    if (recentById.has(id) || goneIds.has(id)) continue;
    const snap = snapshots.current.get(id);
    if (snap) recentById.set(id, snap);
  }

  useEffect(() => {
    const currentIds = new Set(history.map((room) => room.id));

    // First snapshot after mount/load — never animate rooms that were already gone.
    if (prevHistoryIds.current == null) {
      prevHistoryIds.current = currentIds;
      return;
    }

    const dropped: string[] = [];
    for (const id of Array.from(prevHistoryIds.current)) {
      if (currentIds.has(id) || goneIds.has(id) || leavingIds.has(id)) continue;
      dropped.push(id);
    }
    prevHistoryIds.current = currentIds;
    if (dropped.length === 0) return;

    for (const id of dropped) {
      setLeavingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      if (!exitTimers.current.has(id)) {
        const timer = window.setTimeout(() => {
          exitTimers.current.delete(id);
          snapshots.current.delete(id);
          setGoneIds((prev) => new Set(prev).add(id));
          setLeavingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, EXIT_MS);
        exitTimers.current.set(id, timer);
      }
    }
  }, [history, goneIds, leavingIds]);

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

export function hasRecentPvpResults(history: PvpRoom[]): boolean {
  return history.length > 0;
}
