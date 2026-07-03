import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function ProfileBackLink() {
  return (
    <Link
      href="/profile"
      className="-mt-1 mb-2 inline-flex items-center gap-0.5 text-sm text-muted transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      Профиль
    </Link>
  );
}
