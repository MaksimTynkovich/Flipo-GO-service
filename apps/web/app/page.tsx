"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageShell } from "@/components/PageShell";
import { formatTON } from "@/lib/api";
import { ArrowRight, CircleDot, Gift, Layers, ShoppingBag, TrendingUp, Users, Zap } from "lucide-react";

const games = [
  {
    href: "/games/roulette",
    title: "Рулетка",
    desc: "Красное / чёрное ×2 · зелёное ×14",
    tag: "Live",
    icon: CircleDot,
    accent: "text-danger",
  },
  {
    href: "/games/crash",
    title: "Crash",
    desc: "Забери выигрыш до обвала",
    tag: "Live",
    icon: TrendingUp,
    accent: "text-success",
  },
  {
    href: "/games/pvp",
    title: "PvP",
    desc: "Комнаты 1 на 1 — победитель забирает всё",
    tag: "Rooms",
    icon: Users,
    accent: "text-primary",
  },
];

const shortcuts = [
  {
    href: "/market",
    title: "Маркет",
    desc: "Покупай и продавай Telegram Gifts",
    icon: ShoppingBag,
  },
  {
    href: "/profile/inventory",
    title: "Инвентарь",
    desc: "Депозит и продажа подарков",
    icon: Gift,
  },
  {
    href: "/profile/staking",
    title: "Стейкинг",
    desc: "До 5% в месяц — подарок остаётся у тебя",
    icon: Layers,
  },
];

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <PageShell
      title="Добро пожаловать"
      description="Играй на TON, вноси подарки и зарабатывай на стейкинге"
    >
      <div className="panel flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="section-label">Игровой баланс</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {loading ? "…" : user ? formatTON(user.betting_balance) : "—"}
            <span className="ml-1.5 text-sm font-medium text-muted">TON</span>
          </p>
          {user && (
            <p className="mt-2 text-xs text-muted">
              @{user.username || user.first_name} · tier {user.staking_tier}
            </p>
          )}
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/15">
          <Zap className="h-7 w-7 text-accent" />
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="section-label">Игры</h2>
          <Link href="/games" className="text-xs font-medium text-accent">
            Все игры
          </Link>
        </div>
        <div className="space-y-3">
          {games.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="panel flex items-center gap-4 transition-colors hover:border-accent/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
                <g.icon className={`h-5 w-5 ${g.accent}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{g.title}</p>
                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    {g.tag}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{g.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-label px-0.5">Кошелёк и доход</h2>
        <div className="grid grid-cols-2 gap-3">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="panel flex flex-col gap-3 transition-colors hover:border-accent/30"
            >
              <s.icon className="h-5 w-5 text-muted" />
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
