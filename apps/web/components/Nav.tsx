"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Gamepad2, Gift, Home, Layers } from "lucide-react";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inventory", label: "Inventory", icon: Gift },
  { href: "/games/roulette", label: "Roulette", icon: Gamepad2 },
  { href: "/staking", label: "Staking", icon: Layers },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg justify-around py-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 text-xs",
              pathname === href ? "text-primary" : "text-zinc-400",
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
