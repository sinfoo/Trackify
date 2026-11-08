import type { CSSProperties } from "react";
import { Check, Hand, X } from "lucide-react";
import type { ProgressState, ProgressStep } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Dot per state: done = success fill + check, held = warning hand, failed = danger x, upcoming = dashed outline, pending = neutral. */
const DOT: Record<ProgressState, string> = {
  done: "bg-success text-bg",
  held: "border-2 border-warning bg-warning-bg text-warning",
  failed: "border-2 border-danger bg-danger-bg text-danger",
  upcoming: "border-2 border-dashed border-hair2 text-t4",
  pending: "border-2 border-hair2 bg-neutral-bg text-t3",
};
const STATE_TEXT: Record<ProgressState, string> = {
  done: "done",
  held: "held for review",
  failed: "failed",
  upcoming: "upcoming",
  pending: "pending",
};

/** Horizontal (vertical under sm) step tracker for one enrollment's `progress` array. */
export function ProgressTracker({ steps, className }: { steps: ProgressStep[]; className?: string }) {
  return (
    <ol
      aria-label="Enrollment progress"
      className={cn("grid gap-3 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))] sm:gap-0", className)}
      style={{ "--n": steps.length } as CSSProperties}
    >
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li
            key={s.key}
            data-state={s.state}
            className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:px-1 sm:text-center"
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 -bottom-3 w-0.5 sm:top-[13px] sm:left-1/2 sm:bottom-auto sm:h-0.5 sm:w-full",
                  s.state === "done" ? "bg-success" : "bg-hair2",
                )}
              />
            )}
            <span className={cn("relative z-[1] grid size-7 shrink-0 place-items-center rounded-full", DOT[s.state])}>
              {s.state === "done" && <Check aria-hidden className="size-[15px]" strokeWidth={3} />}
              {s.state === "held" && <Hand aria-hidden className="size-[14px]" strokeWidth={2.4} />}
              {s.state === "failed" && <X aria-hidden className="size-[15px]" strokeWidth={3} />}
              {s.state === "pending" && <span aria-hidden className="size-2 rounded-full bg-neutral" />}
            </span>
            <span className="min-w-0 pt-1 sm:pt-0">
              <span className={cn("block text-[12.5px] leading-[1.25] font-extrabold", s.state === "upcoming" ? "text-t4" : "text-text")}>
                {s.label}
                <span className="sr-only">, {STATE_TEXT[s.state]}</span>
              </span>
              {s.detail && <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-t3 [overflow-wrap:anywhere]">{s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
