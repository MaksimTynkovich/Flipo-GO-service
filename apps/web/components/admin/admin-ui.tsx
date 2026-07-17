"use client";

import { cn } from "@/lib/utils";

export function AdminPage({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {(title || description) && (
        <div className="space-y-0.5">
          {title ? (
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          ) : null}
          {description ? (
            <p className="text-xs leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function AdminToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

export function AdminButton({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      className={cn(
        "admin-btn",
        variant === "primary" && "admin-btn-primary",
        variant === "secondary" && "admin-btn-secondary",
        variant === "danger" && "admin-btn-danger",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AdminField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1 text-sm", className)}>
      <span className="text-muted">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

export function AdminPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel space-y-2.5 p-3", className)}>
      <div className="space-y-0.5">
        <h2 className="text-xs font-medium text-foreground">{title}</h2>
        {description ? <p className="text-[11px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminMetric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface-raised/50 px-2.5 py-2",
        accent && "ring-1 ring-inset ring-accent/20",
      )}
    >
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function AdminRankList({
  items,
  emptyText,
  formatName,
}: {
  items: Array<{ name: string; count: number }>;
  emptyText: string;
  formatName?: (name: string) => string;
}) {
  const safeItems = items ?? [];
  if (safeItems.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }
  return (
    <div className="space-y-1">
      {safeItems.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-3 rounded-md bg-surface-raised/40 px-2 py-1.5 text-sm"
        >
          <span className="min-w-0 truncate text-muted">{formatName ? formatName(item.name) : item.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted">{children}</div>
  );
}

export function AdminChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent/15 font-medium text-foreground ring-1 ring-inset ring-accent/30"
          : "bg-surface-raised/60 text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
