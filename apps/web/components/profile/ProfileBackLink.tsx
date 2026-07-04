"use client";

import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getScreenContext } from "@/src/shared/config/navigation";
import { useAppBackNavigation } from "@/src/shared/hooks/useAppBackNavigation";

/** Fallback in-page back control when header is not visible. */
export function ProfileBackLink() {
  const pathname = usePathname();
  const screen = getScreenContext(pathname);
  const goBack = useAppBackNavigation(screen);

  if (screen.level !== "stack" || !screen.backLabel) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="-mt-1 mb-2 inline-flex items-center gap-0.5 text-sm text-muted transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      {screen.backLabel}
    </button>
  );
}
