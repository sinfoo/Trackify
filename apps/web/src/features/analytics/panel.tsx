import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, Eyebrow } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type QueryLike = { isPending: boolean; error: unknown; refetch: () => unknown };

/**
 * Prototype analytics card: radius 22, 20px padding, eyebrow title + 16/800 headline (`description`),
 * loading skeleton and error+retry, for content that sizes itself (lists, tables).
 */
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
    <section className={cn("min-w-0 rounded-[22px] border border-hair bg-panel p-5 shadow-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Eyebrow>{title}</Eyebrow>
          {description && <h3 className="mt-0.5 text-base font-extrabold">{description}</h3>}
        </div>
        {actions}
      </div>
      <div className="mt-3.5">
        {q?.error && !q.isPending ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q?.isPending ? (
          <div className="grid gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
