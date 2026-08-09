"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type Pos = {
  top: number;
  left: number;
};

function readAnchorPos(anchor: HTMLElement | null): Pos | null {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return {
    top: rect.top,
    left: rect.left + rect.width / 2,
  };
}

export function BalanceGainFx({
  anchorRef,
}: {
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const [gain, setGain] = useState<Gain | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const batchUntil = useRef(0);
  const batchId = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const syncPos = () => {
      const next = readAnchorPos(anchorRef.current);
      if (next) setPos(next);
    };

    const onWin = (event: Event) => {
      const deltaNanoton = (event as CustomEvent<BalanceWinDetail>).detail?.deltaNanoton;
      if (!deltaNanoton || deltaNanoton <= 0) return;

      syncPos();

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
    window.addEventListener("resize", syncPos);
    window.addEventListener("scroll", syncPos, true);
    return () => {
      window.removeEventListener(BALANCE_WIN_EVENT, onWin);
      window.removeEventListener("resize", syncPos);
      window.removeEventListener("scroll", syncPos, true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [anchorRef]);

  if (!mounted || !gain) return null;

  const anchorPos = pos ?? readAnchorPos(anchorRef.current);
  if (!anchorPos) return null;

  return createPortal(
    <span
      key={gain.id}
      className="balance-gain-fx-anchor pointer-events-none"
      style={{ top: anchorPos.top, left: anchorPos.left }}
      aria-live="polite"
    >
      <span className="balance-gain-fx">
        <span>+{formatTON(gain.nanoton)}</span>
        <TonIcon variant="brand" className="h-3.5 w-3.5" />
      </span>
    </span>,
    document.body,
  );
}
