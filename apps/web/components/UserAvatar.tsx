"use client";

import { useEffect, useState } from "react";
import { User } from "@/lib/api";
import { cn } from "@/lib/utils";
import { User as UserIcon } from "lucide-react";

type Props = {
  user: User | null;
  size?: number;
  className?: string;
};

export function UserAvatar({ user, size = 36, className }: Props) {
  const [tgPhoto, setTgPhoto] = useState<string | undefined>();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp as
      | { initDataUnsafe?: { user?: { photo_url?: string } } }
      | undefined;
    setTgPhoto(webApp?.initDataUnsafe?.user?.photo_url);
  }, []);

  const photo = user?.photo_url || tgPhoto;
  const initial = (user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase();

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-surface-raised ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {photo && !imgError ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted">
          {user ? (
            <span className="text-sm font-semibold text-foreground">{initial}</span>
          ) : (
            <UserIcon style={{ width: size * 0.45, height: size * 0.45 }} />
          )}
        </span>
      )}
    </span>
  );
}
