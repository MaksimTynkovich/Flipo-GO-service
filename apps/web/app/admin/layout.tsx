"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Дашборд", hint: "GGR, NGR, активность" },
  { href: "/admin/users", label: "Пользователи", hint: "Ставки и фрод" },
  { href: "/admin/games", label: "Игры и RTP", hint: "Лимиты и ключи" },
  { href: "/admin/finance", label: "Финансы", hint: "TON и выводы" },
  { href: "/admin/marketing", label: "Маркетинг", hint: "Промо и рефералы" },
  { href: "/admin/telegram", label: "Telegram", hint: "Бот и рассылки" },
];

function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-xl px-3 py-2 text-sm transition ${
              active
                ? "bg-accent/15 font-semibold text-foreground ring-1 ring-inset ring-accent/30"
                : "bg-surface-raised/60 text-muted hover:text-foreground"
            }`}
          >
            <span className="block">{item.label}</span>
            <span className="mt-0.5 block text-[10px] opacity-70">{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <AdminNav />
      {children}
    </div>
  );
}
