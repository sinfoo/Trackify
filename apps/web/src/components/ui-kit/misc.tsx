"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState } from "./states";

/** Decimal-string money, mono + tabular. `<Money value="1290.000" />` -> 1,290.000 TND */
export function Money({
  value,
  currency = "TND",
  className,
  trim,
}: {
  value: string | number | null | undefined;
  currency?: string;
  className?: string;
  /** Customer-facing: drop ".000" on whole amounts. */
  trim?: boolean;
}) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(value, currency, { trim })}</span>;
}

/** Relative time that refreshes every 30s; full timestamp in the title and datetime attribute. */
export function TimeAgo({ date, className }: { date: string | null | undefined; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!date) return <span className={className}>-</span>;
  return (
    <time dateTime={date} title={formatDateTime(date)} className={cn("whitespace-nowrap", className)} suppressHydrationWarning>
      {formatRelative(date)}
    </time>
  );
}

export function SimulatedBadge({ className, label = "Simulated" }: { className?: string; label?: string }) {
  return (
    <span
      title="Payments are simulated; no real money moves."
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-info/30 bg-info/10 px-2.5 text-xs font-medium text-info-text",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

export function ChartCard({
  title,
  description,
  actions,
  loading,
  error,
  onRetry,
  height = 280,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Chart area height in px. Recharts ResponsiveContainer needs a sized parent. */
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)} aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div style={{ height }}>
        {error && !loading ? (
          <ErrorState error={error} onRetry={onRetry} className="h-full" />
        ) : loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
