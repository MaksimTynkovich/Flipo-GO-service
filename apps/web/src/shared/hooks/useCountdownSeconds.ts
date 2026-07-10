"use client";

import { useEffect, useState } from "react";

/** Whole seconds remaining until `endsAt`. Returns 0 when inactive or expired. */
export function useCountdownSeconds(endsAt: string | undefined, active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active || !endsAt) {
      setSeconds(0);
      return;
    }
    const deadline = new Date(endsAt).getTime();
    if (Number.isNaN(deadline)) {
      setSeconds(0);
      return;
    }

    let frame: number;
    function tick() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left > 0) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, active]);

  return seconds;
}
