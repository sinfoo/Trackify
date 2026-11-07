import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  title = "Could not load this",
  onRetry,
  className,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    error instanceof ApiError
      ? error.status === 403
        ? "Your role does not have access to this."
        : error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-danger/30 bg-danger/5 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mb-2 size-6 text-danger-text" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {error instanceof ApiError && <p className="num mt-1 text-xs text-muted-foreground">{error.code}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}
