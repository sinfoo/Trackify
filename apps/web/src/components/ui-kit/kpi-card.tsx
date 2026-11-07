import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  goodWhen = "up",
  definition,
  hint,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Signed change, e.g. 12.5 or -3. Rendered with arrow icon + sign, not color alone. */
  delta?: number | null;
  /** Suffix after the delta, e.g. "% vs last week". */
  deltaLabel?: string;
  /** Whether an increase is good (revenue) or bad (failed payments). */
  goodWhen?: "up" | "down";
  /** Metric definition shown in an info tooltip. */
  definition?: string;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const good = dir === 0 ? null : (dir > 0) === (goodWhen === "up");
  const DeltaIcon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        {definition && (
          <Tooltip>
            <TooltipTrigger
              aria-label={`Definition of ${label}`}
              className="rounded-sm text-muted-foreground/80 hover:text-foreground"
            >
              <Info aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-sm">{definition}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="num mt-2 text-3xl leading-none font-semibold tracking-tight">
        {loading ? <Skeleton className="h-9 w-32" /> : value}
      </div>
      {(delta != null || hint) && !loading && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {delta != null && (
            <span
              className={cn(
                "num inline-flex items-center gap-0.5 font-medium",
                good === null ? "text-muted-foreground" : good ? "text-success-text" : "text-danger-text",
              )}
            >
              <DeltaIcon aria-hidden className="size-4" />
              {delta > 0 ? "+" : ""}
              {delta}
              {deltaLabel}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
