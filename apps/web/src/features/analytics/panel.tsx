import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type QueryLike = { isPending: boolean; error: unknown; refetch: () => unknown };

/** Card with title, loading skeleton and error+retry, for content that sizes itself (lists, tables). */
export function Panel({
  title,
  description,
  actions,
  q,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  q?: QueryLike;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {q?.error && !q.isPending ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q?.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
