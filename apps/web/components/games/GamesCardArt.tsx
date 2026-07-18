"use client";

import { useEffect, useState } from "react";
import { TonIcon } from "@/components/icons/TonIcon";

type Tone = "wheel" | "crash" | "roulette" | "pvp";

function CrashLiveMult() {
  const [mult, setMult] = useState(1);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const CYCLE_MS = 4800;

    const tick = (now: number) => {
      const t = ((now - t0) % CYCLE_MS) / CYCLE_MS;
      // Slow start, then climbs like a real crash round — reset before "crash"
      const climbed = 1 + Math.pow(t, 1.45) * 4.2;
      setMult(climbed);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="games-art-crash__mult">
      <span className="games-art-crash__value">{mult.toFixed(2)}</span>
      <span className="games-art-crash__x">×</span>
    </div>
  );
}

/** Side preview art — readable metaphor for each mode. */
export function GamesCardArt({ tone }: { tone: Tone }) {
  if (tone === "wheel") {
    return (
      <div className="games-card__art games-card__art--wheel" aria-hidden>
        <div className="games-art-wheel">
          <div className="games-art-wheel__stage">
            <span className="games-art-wheel__spark games-art-wheel__spark--1" />
            <span className="games-art-wheel__spark games-art-wheel__spark--2" />
            <span className="games-art-wheel__spark games-art-wheel__spark--3" />
            <span className="games-art-wheel__spark games-art-wheel__spark--4" />

            <div className="games-art-wheel__reel">
              <div className="games-art-wheel__track">
                <div className="games-art-wheel__cell games-art-wheel__cell--common">
                  <span className="games-art-wheel__amount">0.10</span>
                  <span className="games-art-wheel__unit">
                    <TonIcon variant="brand" className="games-art-wheel__ton" title="" />
                  </span>
                </div>
                <div className="games-art-wheel__cell games-art-wheel__cell--focus">
                  <span className="games-art-wheel__amount">1.00</span>
                  <span className="games-art-wheel__unit">
                    <TonIcon variant="brand" className="games-art-wheel__ton" title="" />
                  </span>
                </div>
                <div className="games-art-wheel__cell games-art-wheel__cell--jackpot">
                  <span className="games-art-wheel__amount">25.00</span>
                  <span className="games-art-wheel__unit">
                    <TonIcon variant="brand" className="games-art-wheel__ton" title="" />
                  </span>
                </div>
              </div>
              <span className="games-art-wheel__marker">
                <span className="games-art-wheel__marker-glow" />
                <span className="games-art-wheel__marker-line" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tone === "crash") {
    return (
      <div className="games-card__art games-card__art--crash" aria-hidden>
        <div className="games-art-crash">
          <CrashLiveMult />
          <svg className="games-art-crash__chart" viewBox="0 0 120 64" fill="none">
            <path
              className="games-art-crash__baseline"
              d="M6 52 H114"
              strokeDasharray="2 3"
            />
            <path
              className="games-art-crash__trail-glow"
              d="M8 50 C 28 48, 38 38, 52 28 C 68 16, 82 10, 102 6"
            />
            <path
              className="games-art-crash__trail"
              d="M8 50 C 28 48, 38 38, 52 28 C 68 16, 82 10, 102 6"
            />
            {/* Nose along path tangent (up-right). SVG +rotate is clockwise — use negative. */}
            <g transform="translate(102 6) rotate(-32)">
              <g className="games-art-crash__rocket">
                <path
                  className="games-art-crash__flame"
                  d="M-1 0 L-7 -2.4 L-7 2.4 Z"
                />
                <path d="M0 -4.2 L11 0 L0 4.2 L2.2 0 Z" />
                <circle cx="5.2" cy="0" r="1.15" className="games-art-crash__rocket-window" />
              </g>
            </g>
          </svg>
          <span className="games-art-crash__caption">успей забрать</span>
        </div>
      </div>
    );
  }

  if (tone === "roulette") {
    return (
      <div className="games-card__art games-card__art--roulette" aria-hidden>
        <div className="games-art-roulette">
          <div className="games-art-roulette__disk" />
          <span className="games-art-roulette__hub">
            <span className="games-art-roulette__pin" />
          </span>
        </div>
        <div className="games-card__art-legend">
          <span className="games-card__swatch games-card__swatch--red" />
          <span className="games-card__swatch games-card__swatch--black" />
          <span className="games-card__swatch games-card__swatch--green" />
        </div>
      </div>
    );
  }

  return (
    <div className="games-card__art games-card__art--pvp" aria-hidden>
      <div className="games-art-pvp__duel">
        <span className="games-art-pvp__face games-art-pvp__face--a">A</span>
        <span className="games-art-pvp__vs">VS</span>
        <span className="games-art-pvp__face games-art-pvp__face--b">B</span>
      </div>
      <span className="games-card__art-chip games-card__art-chip--pvp">1 на 1</span>
    </div>
  );
}
