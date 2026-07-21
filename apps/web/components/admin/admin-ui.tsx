"use client";

import { cn } from "@/lib/utils";

export function AdminPage({
  title: _title,
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
    <div className={cn("space-y-5", className)}>
      {/* Section title lives in workspace header; keep optional description under it. */}
      {description ? (
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--admin-muted,#8b98a8)]">
          {description}
        </p>
      ) : null}
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function AdminToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
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
    <label className={cn("block space-y-1.5 text-sm", className)}>
      <span className="text-[var(--admin-muted,#8b98a8)]">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[11px] leading-relaxed text-[var(--admin-muted,#8b98a8)]">
          {hint}
        </span>
      ) : null}
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
    <section className={cn("admin-panel space-y-3", className)}>
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium text-[var(--admin-fg,#e8eef4)]">{title}</h2>
        {description ? (
          <p className="text-xs leading-relaxed text-[var(--admin-muted,#8b98a8)]">{description}</p>
        ) : null}
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
    <div className={cn("admin-metric", accent && "admin-metric--accent")}>
      <p className="text-xs text-[var(--admin-muted,#8b98a8)]">{label}</p>
      <p className="admin-metric__value">{value}</p>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--admin-muted,#8b98a8)]">{hint}</p>
      ) : null}
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
    return <p className="text-sm text-[var(--admin-muted,#8b98a8)]">{emptyText}</p>;
  }
  return (
    <div className="space-y-1.5">
      {safeItems.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-3 rounded-xl bg-[var(--admin-raised,#1c222d)] px-3 py-2 text-sm"
        >
          <span className="min-w-0 truncate text-[var(--admin-muted,#8b98a8)]">
            {formatName ? formatName(item.name) : item.name}
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--admin-fg,#e8eef4)]">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--admin-border,rgba(255,255,255,0.07))] px-3 py-4 text-sm text-[var(--admin-muted,#8b98a8)]">
      {children}
    </div>
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
        "inline-flex h-9 items-center rounded-lg px-3 text-sm transition-colors",
        active
          ? "bg-[var(--admin-accent-subtle)] font-medium text-[var(--admin-fg)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--admin-accent)_35%,transparent)]"
          : "bg-[var(--admin-raised)] text-[var(--admin-muted)] hover:text-[var(--admin-fg)]",
      )}
    >
      {children}
    </button>
  );
}
