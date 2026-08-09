import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  className?: string;
};

/** Compact route / section loading state. */
export function PageLoader({ label = "Загрузка…", className }: Props) {
  return (
    <div className={cn("page-loader", className)} role="status" aria-live="polite" aria-label={label}>
      <div className="page-loader__spinner" aria-hidden />
      <p className="page-loader__label">{label}</p>
    </div>
  );
}
