import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "danger" }>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary hover:bg-primary/90 text-white",
      outline: "border border-zinc-700 hover:bg-zinc-800",
      danger: "bg-danger hover:bg-danger/90 text-white",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-zinc-800 bg-card p-4", className)}>{children}</div>;
}
