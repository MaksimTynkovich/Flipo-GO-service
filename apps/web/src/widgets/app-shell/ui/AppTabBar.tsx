"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getMainTabs } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";
import { useCasesFeatures } from "@/components/providers/CasesFeaturesProvider";
import { useT } from "@/components/providers/I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export function AppTabBar() {
  const pathname = usePathname();
  const haptics = useTelegramHaptics();
  const { casesVisible } = useCasesFeatures();
  const tabs = getMainTabs({ casesEnabled: casesVisible });
  const t = useT();

  return (
    <nav
      aria-label={t("nav.main")}
      className="app-tabbar absolute bottom-0 left-0 right-0 z-50 bg-background pb-[var(--app-safe-bottom)] pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] hairline-top"
    >
      <div className="app-container flex h-[3.75rem] items-stretch">
        {tabs.map(({ href, id, icon: Icon, match }) => {
          const active = match(pathname);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => haptics.selectionChanged()}
              className={cn(
                "app-control flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl",
                active ? "text-accent" : "text-muted",
              )}
            >
              <span className="tab-icon-wrap flex h-8 w-8 items-center justify-center">
                <Icon
                  size={24}
                  strokeWidth={active ? 2.4 : 1.85}
                  className={cn(
                    "transition-[transform] duration-base ease-out",
                    active && "scale-110",
                  )}
                />
              </span>
              <span
                className={cn(
                  "truncate text-[11px] leading-none transition-colors duration-base ease-out",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {t(`nav.${id}` as MessageKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
