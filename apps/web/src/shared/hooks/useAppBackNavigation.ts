"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { APP_ROUTES, type ScreenContext } from "@/src/shared/config/navigation";
import { useTelegramHaptics } from "@/src/shared/hooks/useTelegramHaptics";

export function useAppBackNavigation(context: ScreenContext) {
  const router = useRouter();
  const haptics = useTelegramHaptics();

  return useCallback(() => {
    haptics.impactOccurred("light");

    if (context.useRouterBack && typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(context.backHref ?? APP_ROUTES.games);
  }, [context.backHref, context.useRouterBack, haptics, router]);
}
