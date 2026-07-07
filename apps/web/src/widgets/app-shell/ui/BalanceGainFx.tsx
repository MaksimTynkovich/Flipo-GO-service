"use client";

import { useEffect, useState } from "react";
import { TonIcon } from "@/components/icons/TonIcon";
import { formatTON } from "@/lib/api";
import { BALANCE_WIN_EVENT, BalanceWinDetail } from "@/lib/balance-win";

const GAIN_FX_MS = 2500;

type Gain = {
  id: number;
  amount: string;
};

export function BalanceGainFx() {
  const [gains, setGains] = useState<Gain[]>([]);

  useEffect(() => {
    const onWin = (event: Event) => {
      const deltaNanoton = (event as CustomEvent<BalanceWinDetail>).detail?.deltaNanoton;
      if (!deltaNanoton || deltaNanoton <= 0) return;

      const id = Date.now() + Math.random();
      setGains((current) => [...current, { id, amount: formatTON(deltaNanoton) }]);
      window.setTimeout(() => {
        setGains((current) => current.filter((gain) => gain.id !== id));
      }, GAIN_FX_MS);
    };

    window.addEventListener(BALANCE_WIN_EVENT, onWin);
    return () => window.removeEventListener(BALANCE_WIN_EVENT, onWin);
  }, []);

  return (
    <>
      {gains.map((gain) => (
        <span
          key={gain.id}
          className="balance-gain-fx pointer-events-none absolute right-full top-1/2 z-10 mr-2.5 flex items-center gap-1 whitespace-nowrap"
        >
          <span>+{gain.amount}</span>
          <TonIcon variant="brand" className="h-4 w-4" />
        </span>
      ))}
    </>
  );
}
