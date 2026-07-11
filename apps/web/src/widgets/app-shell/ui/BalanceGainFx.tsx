"use client";

import { useEffect, useRef, useState } from "react";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { BALANCE_WIN_EVENT, BalanceWinDetail } from "@/lib/balance-win";

/** Merge rapid win credits (multi-bet cashout) into one plaque. */
const BATCH_MS = 1200;
const GAIN_FX_MS = 2800;

type Gain = {
  id: number;
  nanoton: number;
};

export function BalanceGainFx() {
  const [gain, setGain] = useState<Gain | null>(null);
  const hideTimer = useRef<number | null>(null);
  const batchUntil = useRef(0);
  const batchId = useRef(0);

  useEffect(() => {
    const onWin = (event: Event) => {
      const deltaNanoton = (event as CustomEvent<BalanceWinDetail>).detail?.deltaNanoton;
      if (!deltaNanoton || deltaNanoton <= 0) return;

      const now = Date.now();
      setGain((current) => {
        if (current && now < batchUntil.current) {
          batchUntil.current = now + BATCH_MS;
          return { ...current, nanoton: current.nanoton + deltaNanoton };
        }
        const id = now + Math.random();
        batchId.current = id;
        batchUntil.current = now + BATCH_MS;
        return { id, nanoton: deltaNanoton };
      });

      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      const expectedId = batchId.current;
      hideTimer.current = window.setTimeout(() => {
        setGain((current) => (current?.id === expectedId ? null : current));
        hideTimer.current = null;
      }, GAIN_FX_MS);
    };

    window.addEventListener(BALANCE_WIN_EVENT, onWin);
    return () => {
      window.removeEventListener(BALANCE_WIN_EVENT, onWin);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!gain) return null;

  return (
    <span
      key={gain.id}
      className="balance-gain-fx pointer-events-none absolute right-full top-1/2 z-10 mr-2.5 flex items-center gap-1 whitespace-nowrap"
    >
      <span>+{formatTON(gain.nanoton)}</span>
      <TonIcon variant="brand" className="h-4 w-4" />
    </span>
  );
}
