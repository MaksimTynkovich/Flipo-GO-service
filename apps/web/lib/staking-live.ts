"use client";

import { useEffect, useState } from "react";

export function useLiveEarned(earnedNanoton: number, dailyNanoton: number) {
  const [live, setLive] = useState(earnedNanoton);
  const [anchor, setAnchor] = useState(Date.now());

  useEffect(() => {
    setLive(earnedNanoton);
    setAnchor(Date.now());
  }, [earnedNanoton, dailyNanoton]);

  useEffect(() => {
    if (dailyNanoton <= 0) return;
    const tick = setInterval(() => {
      const elapsed = Date.now() - anchor;
      setLive(earnedNanoton + Math.floor((dailyNanoton * elapsed) / 86_400_000));
    }, 1000);
    return () => clearInterval(tick);
  }, [earnedNanoton, dailyNanoton, anchor]);

  return live;
}
