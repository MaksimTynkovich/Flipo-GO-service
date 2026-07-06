"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MAIN_TABS } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function AppTabBar() {
  const pathname = usePathname();
  const haptics = useTelegramHaptics();

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] backdrop-blur-2xl hairline-top"
    >
      <div className="app-container grid h-[3.25rem] grid-cols-4 items-stretch">
        {MAIN_TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => haptics.selectionChanged()}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70",
                active ? "text-accent" : "text-muted",
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
              <span className={cn("truncate text-[10px]", active ? "font-semibold" : "font-medium")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
