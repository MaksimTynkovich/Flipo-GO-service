"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEBUG_AUTH } from "@/lib/api";
import { hasTelegramInitData } from "@/src/shared/lib/twa";

const TELEGRAM_INIT_WAIT_MS = 300;

export function useTelegramAccess() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (DEBUG_AUTH || isAdminRoute) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    if (hasTelegramInitData()) {
      setAllowed(true);
      setChecking(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setAllowed(hasTelegramInitData());
      setChecking(false);
    }, TELEGRAM_INIT_WAIT_MS);

    return () => window.clearTimeout(timer);
  }, [isAdminRoute]);

  return { checking, allowed };
}
