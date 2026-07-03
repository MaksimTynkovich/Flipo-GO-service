import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ArrowRight, CircleDot, TrendingUp, Users } from "lucide-react";

const games = [
  {
    href: "/games/roulette",
    title: "Рулетка",
    desc: "15 секторов · красное / чёрное ×2 · зелёное ×14",
    icon: CircleDot,
    color: "bg-danger/15 text-danger",
  },
  {
    href: "/games/crash",
    title: "Crash",
    desc: "Множитель растёт — успей вывести до краша",
    icon: TrendingUp,
    color: "bg-success/15 text-success",
  },
  {
    href: "/games/pvp",
    title: "PvP",
    desc: "Создай комнату или присоединись к игре",
    icon: Users,
    color: "bg-primary/15 text-primary",
  },
];

export default function GamesPage() {
  return (
    <PageShell title="Игры" description="Выбери режим и начни играть">
      <div className="space-y-2">
        {games.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="panel flex items-center gap-4 transition-colors hover:border-accent/30"
          >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${g.color}`}>
              <g.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{g.title}</p>
              <p className="text-xs text-muted">{g.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
