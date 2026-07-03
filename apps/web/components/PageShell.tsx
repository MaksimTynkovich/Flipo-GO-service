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
    <div className={cn("space-y-7", className)}>
      {(title || description) && (
        <div className="space-y-1.5">
          {title && <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>}
          {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      )}
      {flush ? children : <div className="space-y-6">{children}</div>}
    </div>
  );
}
