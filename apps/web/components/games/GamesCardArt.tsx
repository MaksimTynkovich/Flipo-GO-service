"use client";

type Tone = "crash" | "roulette" | "pvp";

/** Decorative background art unique to each game mode. */
export function GamesCardArt({ tone }: { tone: Tone }) {
  if (tone === "crash") {
    return (
      <div className="games-card__art games-card__art--crash" aria-hidden>
        <svg className="games-card__art-svg" viewBox="0 0 180 140" fill="none">
          <path
            className="games-art-crash__grid"
            d="M20 20v100M50 20v100M80 20v100M110 20v100M140 20v100M170 20v100M20 40h150M20 70h150M20 100h150"
          />
          <path
            className="games-art-crash__trail"
            d="M12 118 C 40 112, 48 96, 62 78 C 78 56, 92 42, 118 28 C 138 18, 152 14, 172 8"
          />
          <circle className="games-art-crash__dot games-art-crash__dot--1" cx="62" cy="78" r="3.2" />
          <circle className="games-art-crash__dot games-art-crash__dot--2" cx="118" cy="28" r="3.6" />
          <circle className="games-art-crash__rocket" cx="172" cy="8" r="5" />
        </svg>
      </div>
    );
  }

  if (tone === "roulette") {
    return (
      <div className="games-card__art games-card__art--roulette" aria-hidden>
        <svg className="games-card__art-svg" viewBox="0 0 160 160" fill="none">
          <g className="games-art-roulette__wheel">
            <circle cx="80" cy="80" r="62" className="games-art-roulette__rim" />
            <path d="M80 80 L80 18 A62 62 0 0 1 128.5 38 Z" className="games-art-roulette__seg games-art-roulette__seg--red" />
            <path d="M80 80 L128.5 38 A62 62 0 0 1 142 80 Z" className="games-art-roulette__seg games-art-roulette__seg--black" />
            <path d="M80 80 L142 80 A62 62 0 0 1 128.5 122 Z" className="games-art-roulette__seg games-art-roulette__seg--red" />
            <path d="M80 80 L128.5 122 A62 62 0 0 1 80 142 Z" className="games-art-roulette__seg games-art-roulette__seg--black" />
            <path d="M80 80 L80 142 A62 62 0 0 1 31.5 122 Z" className="games-art-roulette__seg games-art-roulette__seg--red" />
            <path d="M80 80 L31.5 122 A62 62 0 0 1 18 80 Z" className="games-art-roulette__seg games-art-roulette__seg--green" />
            <path d="M80 80 L18 80 A62 62 0 0 1 31.5 38 Z" className="games-art-roulette__seg games-art-roulette__seg--black" />
            <path d="M80 80 L31.5 38 A62 62 0 0 1 80 18 Z" className="games-art-roulette__seg games-art-roulette__seg--red" />
            <circle cx="80" cy="80" r="18" className="games-art-roulette__hub" />
            <circle cx="80" cy="80" r="6" className="games-art-roulette__pin" />
          </g>
          <circle className="games-art-roulette__ball" cx="80" cy="22" r="4.5" />
        </svg>
      </div>
    );
  }

  return (
    <div className="games-card__art games-card__art--pvp" aria-hidden>
      <svg className="games-card__art-svg" viewBox="0 0 180 140" fill="none">
        <path
          className="games-art-pvp__beam games-art-pvp__beam--left"
          d="M-10 130 L95 55 L88 48 L-20 118 Z"
        />
        <path
          className="games-art-pvp__beam games-art-pvp__beam--right"
          d="M190 130 L85 55 L92 48 L200 118 Z"
        />
        <path
          className="games-art-pvp__slash"
          d="M72 42 L108 78 M78 36 L114 72"
        />
        <circle className="games-art-pvp__spark games-art-pvp__spark--1" cx="90" cy="58" r="3" />
        <circle className="games-art-pvp__spark games-art-pvp__spark--2" cx="102" cy="48" r="2.2" />
        <circle className="games-art-pvp__spark games-art-pvp__spark--3" cx="78" cy="68" r="2" />
        <text className="games-art-pvp__vs" x="90" y="108" textAnchor="middle">
          VS
        </text>
      </svg>
    </div>
  );
}
