import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "danger" | "accent" }
>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-primary hover:bg-primary/90 text-white",
    outline: "border border-border bg-surface-raised hover:bg-surface text-foreground",
    danger: "bg-danger hover:bg-danger/90 text-white",
    accent: "bg-accent hover:bg-accent/90 text-surface font-semibold",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-40",
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
