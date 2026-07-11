"use client";

import { useEffect, useState } from "react";
import { getPresence, type PresenceSnapshot } from "@/lib/api";

const EMPTY: PresenceSnapshot = {
  online: 0,
  by_game: {},
  updated_at: "",
};

/** Polls total / per-game presence for lobby badges and header. */
export function usePresence(pollMs = 5000) {
  const [presence, setPresence] = useState<PresenceSnapshot>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPresence()
        .then((snap) => {
          if (!cancelled) setPresence(snap);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return presence;
}
