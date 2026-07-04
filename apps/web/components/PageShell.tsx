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
    <div className={cn("space-y-5", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
          )}
          {description && <p className="text-[0.8125rem] leading-relaxed text-muted">{description}</p>}
        </div>
      )}
      {flush ? children : <div className="space-y-4">{children}</div>}
    </div>
  );
}
