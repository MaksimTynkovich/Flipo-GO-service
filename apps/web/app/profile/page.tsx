"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { LanguageSelector } from "@/components/profile/LanguageSelector";
import { PageShell } from "@/components/PageShell";
import { formatTON } from "@/lib/api";
import { ArrowRight, Gift, Layers, User, Users } from "lucide-react";

const sections = [
  {
    href: "/profile/inventory",
    title: "Инвентарь",
    desc: "Депозит и продажа Telegram Gifts",
    icon: Gift,
    color: "bg-primary/15 text-primary",
  },
  {
    href: "/profile/referrals",
    title: "Рефералы",
    desc: "Приглашай друзей и получай бонусы",
    icon: Users,
    color: "bg-success/15 text-success",
  },
  {
    href: "/profile/staking",
    title: "Стейкинг",
    desc: "До 5% в месяц — без передачи подарка боту",
    icon: Layers,
    color: "bg-accent/15 text-accent",
  },
];

export default function ProfilePage() {
  const { user, loading } = useAuth();

  return (
    <PageShell title="Профиль" description="Настройки аккаунта и управление активами">
      <div className="panel flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-raised">
          <User className="h-7 w-7 text-muted" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">
            {loading ? "…" : user?.first_name || "Игрок"}
          </p>
          {user && (
            <p className="truncate text-sm text-muted">
              @{user.username || user.telegram_id}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            Tier {loading ? "…" : user?.staking_tier ?? "—"} ·{" "}
            {loading ? "…" : user ? `${formatTON(user.betting_balance)} TON` : "—"}
          </p>
        </div>
      </div>

      <LanguageSelector />

      <section className="space-y-2">
        <p className="section-label px-0.5">Разделы</p>
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="panel flex items-center gap-4 transition-colors hover:border-accent/30"
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.color}`}
            >
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-0.5 text-xs text-muted">{s.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        ))}
      </section>
    </PageShell>
  );
}
