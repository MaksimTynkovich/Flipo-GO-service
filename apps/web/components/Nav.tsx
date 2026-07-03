"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Gamepad2, Home, ShoppingBag, User } from "lucide-react";

const links = [
  { href: "/", label: "Главная", icon: Home, match: (p: string) => p === "/" },
  {
    href: "/market",
    label: "Маркет",
    icon: ShoppingBag,
    match: (p: string) => p.startsWith("/market"),
  },
  {
    href: "/games",
    label: "Игры",
    icon: Gamepad2,
    match: (p: string) => p.startsWith("/games"),
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: User,
    match: (p: string) => p.startsWith("/profile"),
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="app-container flex h-16 items-stretch justify-around">
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
                active ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className={cn("text-[10px] font-medium", active && "font-semibold")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
