"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PvpRoom } from "@/lib/pvp";
import { cn } from "@/lib/utils";

/** Fixed lobby berths — rooms claim a slot and leave it empty, never collapse the list. */
export const PVP_ROOM_SLOT_COUNT = 24;

const EXIT_MS = 480;
const ENTER_MS = 420;

export type PvpRoomSlot = {
  index: number;
  room: PvpRoom | null;
  entering: boolean;
  leaving: boolean;
};

/**
 * Pre-allocated room berths.
 * New rooms take the first free slot and keep it through open → live → result.
 * When the room leaves the lobby the berth stays, just becomes empty again.
 */
export function usePvpRoomSlots(active: PvpRoom[], history: PvpRoom[]) {
  const slotOf = useRef<Map<string, number>>(new Map());
  const slotsRef = useRef<(string | null)[]>(
    Array.from({ length: PVP_ROOM_SLOT_COUNT }, () => null),
  );
  const snapshots = useRef<Map<string, PvpRoom>>(new Map());
  const exitTimers = useRef<Map<string, number>>(new Map());
  const enterTimers = useRef<Map<string, number>>(new Map());
  const prevLiveKey = useRef<string | null>(null);
  const pendingEnter = useRef<string[]>([]);
  const leavingRef = useRef<Set<string>>(new Set());

  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set());
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [version, setVersion] = useState(0);

  const liveById = useMemo(() => {
    const map = new Map<string, PvpRoom>();
    for (const room of active) map.set(room.id, room);
    for (const room of history) {
      if (!map.has(room.id)) map.set(room.id, room);
    }
    return map;
  }, [active, history]);

  const liveKey = useMemo(
    () => Array.from(liveById.keys()).sort().join("|"),
    [liveById],
  );

  for (const [id, room] of Array.from(liveById.entries())) {
    snapshots.current.set(id, room);
  }

  useEffect(() => {
    return () => {
      for (const id of Array.from(exitTimers.current.values())) {
        window.clearTimeout(id);
      }
      for (const id of Array.from(enterTimers.current.values())) {
        window.clearTimeout(id);
      }
      exitTimers.current.clear();
      enterTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const currentIds = new Set(liveKey ? liveKey.split("|").filter(Boolean) : []);
    if (prevLiveKey.current == null) {
      prevLiveKey.current = liveKey;
      return;
    }

    const prevIds = new Set(
      prevLiveKey.current ? prevLiveKey.current.split("|").filter(Boolean) : [],
    );
    prevLiveKey.current = liveKey;

    const dropped: string[] = [];
    for (const id of Array.from(prevIds)) {
      if (currentIds.has(id) || leavingRef.current.has(id)) continue;
      dropped.push(id);
    }
    if (dropped.length === 0) return;

    for (const id of dropped) {
      leavingRef.current.add(id);
      setLeavingIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      if (!exitTimers.current.has(id)) {
        const timer = window.setTimeout(() => {
          exitTimers.current.delete(id);
          leavingRef.current.delete(id);
          snapshots.current.delete(id);

          const slot = slotOf.current.get(id);
          if (slot != null && slotsRef.current[slot] === id) {
            slotsRef.current[slot] = null;
          }
          slotOf.current.delete(id);

          setLeavingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setVersion((n) => n + 1);
        }, EXIT_MS);
        exitTimers.current.set(id, timer);
      }
    }
  }, [liveKey]);

  useEffect(() => {
    if (pendingEnter.current.length === 0) return;
    const ids = pendingEnter.current;
    pendingEnter.current = [];

    setEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });

    for (const id of ids) {
      if (enterTimers.current.has(id)) continue;
      const timer = window.setTimeout(() => {
        enterTimers.current.delete(id);
        setEnteringIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ENTER_MS);
      enterTimers.current.set(id, timer);
    }
  }, [version, liveKey]);

  void version;

  const claimSlot = (roomId: string) => {
    const existing = slotOf.current.get(roomId);
    if (existing != null) return existing;

    for (let i = 0; i < slotsRef.current.length; i++) {
      if (slotsRef.current[i] == null) {
        slotsRef.current[i] = roomId;
        slotOf.current.set(roomId, i);
        return i;
      }
    }
    return null;
  };

  const appended: string[] = [];
  // Prefer active rooms, then history — same id keeps its berth.
  for (const room of [...active, ...history]) {
    if (leavingRef.current.has(room.id)) continue;
    const before = slotOf.current.has(room.id);
    const slot = claimSlot(room.id);
    if (slot == null) continue;
    if (!before) appended.push(room.id);
  }

  if (appended.length > 0) {
    pendingEnter.current.push(...appended);
  }

  const pendingEntering = new Set(pendingEnter.current);
  const slots: PvpRoomSlot[] = slotsRef.current.map((roomId, index) => {
    if (!roomId) {
      return { index, room: null, entering: false, leaving: false };
    }
    const room = liveById.get(roomId) ?? snapshots.current.get(roomId) ?? null;
    return {
      index,
      room,
      entering: enteringIds.has(roomId) || pendingEntering.has(roomId),
      leaving: leavingIds.has(roomId),
    };
  });

  const occupied = slots.reduce((n, slot) => n + (slot.room ? 1 : 0), 0);

  return { slots, occupied };
}

/** @deprecated Prefer usePvpRoomSlots */
export function useStickyPvpRooms(active: PvpRoom[], history: PvpRoom[]) {
  const { slots } = usePvpRoomSlots(active, history);
  const rooms = slots
    .map((slot) => slot.room)
    .filter((room): room is PvpRoom => room != null);
  return {
    waiting: { rooms, leavingIds: new Set<string>(), enteringIds: new Set<string>() },
    live: { rooms: [], leavingIds: new Set<string>(), enteringIds: new Set<string>() },
    recent: { rooms: [], leavingIds: new Set<string>(), enteringIds: new Set<string>() },
  };
}

/** @deprecated */
export function usePvpFinishedVisibility(history: PvpRoom[]) {
  const sticky = usePvpRoomSlots([], history);
  const rooms = sticky.slots
    .map((slot) => slot.room)
    .filter((room): room is PvpRoom => room != null);
  return {
    recentById: new Map(rooms.map((room) => [room.id, room])),
    leavingIds: new Set<string>(),
    goneIds: new Set<string>(),
    hasRecent: rooms.length > 0,
  };
}

export function PvpRoomExitShell({
  leaving,
  entering,
  empty,
  children,
  className,
}: {
  leaving?: boolean;
  entering?: boolean;
  empty?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pvp-room-slot",
        className,
        empty && "pvp-room-slot--empty",
        entering && "pvp-room-enter",
        leaving && "pvp-room-exit",
      )}
    >
      <div className="pvp-room-slot__inner">{children}</div>
    </div>
  );
}

export function PvpEmptyRoomSlot() {
  return (
    <div className="pvp-room pvp-room--berth" aria-hidden>
      <div className="pvp-room__berth-frame">
        <span className="pvp-room__berth-dot" />
        <span className="pvp-room__berth-label">Свободно</span>
      </div>
    </div>
  );
}

export function hasRecentPvpResults(history: PvpRoom[]): boolean {
  return history.length > 0;
}
