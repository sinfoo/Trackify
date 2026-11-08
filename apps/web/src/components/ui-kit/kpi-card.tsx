import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Sparkline } from "./misc";

/**
 * KPI tile (radius 18): eyebrow, value 24/800 + unit, delta row with an inline 64x24 sparkline.
 * `spark` = last values (oldest first); the delta colour follows `goodWhen`.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  goodWhen = "up",
  definition,
  hint,
  spark,
  sparkColor,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Unit after the value, e.g. "TND" or "%". */
  unit?: ReactNode;
  /** Signed change, e.g. 12.5 or -3. Rendered with arrow icon + sign, not color alone. */
  delta?: number | null;
  /** Suffix after the delta, e.g. "% vs last week". */
  deltaLabel?: string;
  /** Whether an increase is good (revenue) or bad (failed payments). */
  goodWhen?: "up" | "down";
  /** Metric definition shown in an info tooltip. */
  definition?: string;
  hint?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  loading?: boolean;
  className?: string;
}) {
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const good = dir === 0 ? null : (dir > 0) === (goodWhen === "up");
  const DeltaIcon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  const deltaColor = good === null ? "text-t3" : good ? "text-success" : "text-danger";
  return (
    <div className={cn("flex flex-col rounded-[18px] border border-hair bg-panel p-4 shadow-card", className)}>
      <div className="flex items-center gap-1.5">
        <span className="eyebrow">{label}</span>
        {definition && (
          <Tooltip>
            <TooltipTrigger aria-label={`Definition of ${label}`} className="rounded-sm text-t4 hover:text-text">
              <Info aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{definition}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <>
            <span className="tabular text-2xl leading-none font-extrabold tracking-[-0.02em]">{value}</span>
            {unit && <span className="text-[13px] font-semibold text-t3">{unit}</span>}
          </>
        )}
      </div>
      {!loading && (delta != null || hint || spark) && (
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {delta != null && (
              <span className={cn("num inline-flex items-center gap-0.5 font-bold", deltaColor)}>
                <DeltaIcon aria-hidden className="size-3.5" strokeWidth={2.4} />
                {delta > 0 ? "+" : ""}
                {delta}
                {deltaLabel}
              </span>
            )}
            {hint && <span className="text-t3">{hint}</span>}
          </div>
          {spark && spark.length > 1 && (
            <Sparkline data={spark} color={sparkColor ?? (good === false ? "var(--danger)" : "var(--brand)")} />
          )}
        </div>
      )}
    </div>
  );
}
