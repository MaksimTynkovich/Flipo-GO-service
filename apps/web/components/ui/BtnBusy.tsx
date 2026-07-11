import { cn } from "@/lib/utils";

type Props = {
  label: string;
  className?: string;
};

/** Compact busy state for primary game CTAs (bet / cashout / create). */
export function BtnBusy({ label, className }: Props) {
  return (
    <span
      className={cn("inline-flex items-center justify-center gap-2", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="btn-spinner" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
