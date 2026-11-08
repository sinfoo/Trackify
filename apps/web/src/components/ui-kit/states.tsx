import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Legacy page header (28/800 title + description + actions). New pages: prefer `PageTitle` from ui-kit/misc. */
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
        <h1 className="headline text-[28px] leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-t3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Centred icon tile + 14px copy + one action (README "Empty states"). */
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
        "flex flex-col items-center justify-center rounded-[22px] border border-dashed border-hair2 bg-panel px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-[14px] bg-panel3 text-t3">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-bold">{title}</p>
      {description && <p className="mt-1 max-w-md text-[13px] text-t3">{description}</p>}
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
        "flex flex-col items-center justify-center rounded-[22px] border border-danger/30 bg-danger-bg/40 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-[14px] bg-danger-bg text-danger">
        <AlertTriangle aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-md text-[13px] text-t3">{message}</p>
      {error instanceof ApiError && <p className="num mt-1 text-xs text-t4">{error.code}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}
