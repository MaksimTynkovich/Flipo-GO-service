"use client";

import Image from "next/image";

type Tone = "crash" | "roulette";

const COVERS: Record<Tone, string> = {
  crash: "/games/covers/mode-crash.webp",
  roulette: "/games/covers/mode-roulette.webp",
};

/** Full soft-3D cover image for lobby duo cards. */
export function GamesCardArt({ tone }: { tone: Tone }) {
  return (
    <div className={`games-card__cover games-card__cover--${tone}`} aria-hidden>
      <Image
        className="games-card__cover-img"
        src={COVERS[tone]}
        alt=""
        fill
        sizes="(max-width: 480px) 50vw, 220px"
        draggable={false}
        priority
      />
      <div className="games-card__cover-fade" />
    </div>
  );
}
