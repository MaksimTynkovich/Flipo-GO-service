"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getAdminUsers, type AdminUser } from "@/lib/api";
import { cn } from "@/lib/utils";

function userLabel(user: AdminUser): string {
  const name = user.first_name || user.username || `id ${user.telegram_id}`;
  const handle = user.username ? ` @${user.username}` : "";
  return `${name}${handle} · ${user.telegram_id}`;
}

type Props = {
  label?: string;
  value: number | null;
  onChange: (telegramId: number | null, user: AdminUser | null) => void;
  className?: string;
};

export function AdminUserPicker({ label = "Игрок", value, onChange, className }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await getAdminUsers(query, "last_login");
        if (!cancelled) setUsers(rows);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 220 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (value == null) {
      setSelected(null);
      return;
    }
    if (selected?.telegram_id === value) return;
    const match = users.find((u) => u.telegram_id === value);
    if (match) setSelected(match);
  }, [value, users, selected?.telegram_id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(user: AdminUser) {
    setSelected(user);
    setQuery("");
    setOpen(false);
    onChange(user.telegram_id, user);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    onChange(null, null);
  }

  return (
    <div ref={rootRef} className={cn("relative text-xs text-muted", className)}>
      <span>{label}</span>
      <div className="mt-1">
        {selected && value != null ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface px-2 py-1.5">
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{userLabel(selected)}</p>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted hover:text-foreground"
              onClick={clear}
            >
              Сменить
            </button>
          </div>
        ) : (
          <input
            className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
            placeholder="Имя, @username или Telegram ID"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={listId}
            role="combobox"
            autoComplete="off"
          />
        )}
      </div>

      {open && !selected ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-surface py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-muted">Поиск…</li>
          ) : users.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Никого не найдено</li>
          ) : (
            users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-raised"
                  onClick={() => pick(user)}
                >
                  <span className="truncate text-sm text-foreground">
                    {user.first_name || user.username || `id ${user.telegram_id}`}
                    {user.username ? (
                      <span className="ml-1.5 text-muted">@{user.username}</span>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-muted">{user.telegram_id}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
