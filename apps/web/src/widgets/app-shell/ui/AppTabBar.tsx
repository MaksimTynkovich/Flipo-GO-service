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
      className="app-tabbar absolute bottom-0 left-0 right-0 z-50 bg-background pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] hairline-top"
    >
      <div
        className={cn(
          "app-container grid h-[3.25rem] items-stretch",
          MAIN_TABS.length === 5 ? "grid-cols-5" : "grid-cols-4",
        )}
      >
        {MAIN_TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => haptics.selectionChanged()}
              className={cn(
                "app-control flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl",
                active ? "text-accent" : "text-muted",
              )}
            >
              <span className="tab-icon-wrap flex h-7 w-7 items-center justify-center">
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 1.75}
                  className={cn(
                    "transition-[transform] duration-base ease-out",
                    active && "scale-105",
                  )}
                />
              </span>
              <span
                className={cn(
                  "truncate text-[10px] transition-colors duration-base ease-out",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
