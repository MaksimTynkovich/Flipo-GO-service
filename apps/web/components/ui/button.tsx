import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { trackDisabledClick } from "@/lib/analytics";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "outline" | "danger" | "accent";
    analyticsAction?: string;
  }
>(({ className, variant = "default", analyticsAction, onPointerDown, disabled, ...props }, ref) => {
  const variants = {
    default: "btn-primary",
    outline:
      "bg-surface-raised text-foreground hover:bg-[color-mix(in_srgb,var(--surface-raised)_70%,white)] active:brightness-95",
    danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
    accent: "btn-primary font-semibold",
  };
  return (
    <button
      ref={ref}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) {
          trackDisabledClick(analyticsAction || props.id || "button");
        }
        onPointerDown?.(event);
      }}
      className={cn(
        "app-control relative overflow-hidden inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("panel", className)}>{children}</div>;
}
