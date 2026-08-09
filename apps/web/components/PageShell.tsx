import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
};

export function PageShell({ title, description, children, className, flush }: Props) {
  return (
    <div className={cn("space-y-6", className)}>
      {(title || description) && (
        <div className="space-y-2">
          {title && (
            <h1 className="text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-foreground">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-[0.9375rem] leading-relaxed text-muted">{description}</p>
          )}
        </div>
      )}
      {flush ? children : <div className="space-y-5">{children}</div>}
    </div>
  );
}
