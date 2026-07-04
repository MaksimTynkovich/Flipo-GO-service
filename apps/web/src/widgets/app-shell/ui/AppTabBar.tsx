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
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="app-container px-0">
        <div className="grid h-16 grid-cols-4 gap-1 rounded-[1.75rem] border border-border/60 bg-surface/95 p-1.5 shadow-floating backdrop-blur-xl">
          {MAIN_TABS.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => haptics.selectionChanged()}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-muted transition-colors active:scale-[0.98]",
                  active && "bg-surface-raised text-foreground",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className={cn("truncate text-[10px] font-medium", active && "font-semibold")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
