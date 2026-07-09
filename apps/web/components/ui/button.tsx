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
    default: "bg-accent text-white active:opacity-90",
    outline: "bg-surface-raised text-foreground active:opacity-80",
    danger: "bg-danger text-white active:opacity-90",
    accent: "bg-accent text-white font-semibold active:opacity-90",
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
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40",
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
