import { cn } from "@/lib/utils";
import { getRuntimeLocale, translate } from "@/lib/i18n";

type Props = {
  label?: string;
  className?: string;
};

/** Compact route / section loading state. */
export function PageLoader({ label, className }: Props) {
  const text = label ?? translate(getRuntimeLocale(), "common.loadingEllipsis");
  return (
    <div className={cn("page-loader", className)} role="status" aria-live="polite" aria-label={text}>
      <div className="page-loader__spinner" aria-hidden />
      <p className="page-loader__label">{text}</p>
    </div>
  );
}
