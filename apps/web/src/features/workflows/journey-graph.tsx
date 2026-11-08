import type { CSSProperties } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Eyebrow, humanize } from "@/components/ui-kit";
import type { WorkflowState, WorkflowStep } from "@/lib/types";

/** Happy path, in machine order (prototype WF_STATES). */
const MAIN: WorkflowState[] = [
  "NEW_CUSTOMER",
  "SALES_INTERACTION",
  "CUSTOMER_ANALYSIS",
  "PRODUCT_RECOMMENDATION",
  "ENROLLMENT_REQUEST",
  "SECURITY_CHECK",
  "PAYMENT_SESSION",
  "PAYMENT_PROCESSING",
  "AWAITING_APPROVAL",
  "FINANCIAL_ANALYSIS",
  "BUSINESS_RECOMMENDATION",
  "COMPLETED",
];
/** Exits of the real 17-state machine (docs/WORKFLOWS.md). Shown on a second row. */
const EXITS: WorkflowState[] = ["LOW_INTENT", "PAYMENT_FAILED", "BLOCKED", "CANCELLED", "ERROR"];
const BAD = new Set<WorkflowState>(["PAYMENT_FAILED", "BLOCKED", "CANCELLED", "ERROR"]);

type Look = "current" | "failed" | "visited" | "visited-bad" | "idle";

const STYLE: Record<Look, CSSProperties> = {
  current: { border: "1px solid var(--brand)", background: "var(--brand)", color: "var(--on-brand)", boxShadow: "0 0 0 4px var(--brand-bg)" },
  failed: { border: "1px solid var(--danger)", background: "var(--danger-bg)", color: "var(--danger)", boxShadow: "0 0 0 4px var(--danger-bg)" },
  visited: { border: "1px solid var(--hair2)", background: "var(--panel2)", color: "var(--text)" },
  "visited-bad": { border: "1px solid var(--hair2)", background: "var(--danger-bg)", color: "var(--danger)" },
  idle: { border: "1px dashed var(--hair2)", background: "transparent", color: "var(--t4)" },
};

function Chip({ state, look, visits }: { state: WorkflowState; look: Look; visits: number }) {
  return (
    <span
      aria-current={look === "current" || look === "failed" ? "step" : undefined}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-full px-[11px] text-[12.5px] font-bold whitespace-nowrap transition-[background-color,box-shadow] duration-300"
      style={STYLE[look]}
    >
      {look.startsWith("visited") && <Check aria-hidden className="size-3" strokeWidth={3} />}
      {humanize(state)}
      {visits > 1 && <span className="num opacity-70">×{visits}</span>}
    </span>
  );
}

const Swatch = ({ look }: { look: Look }) => <span aria-hidden className="inline-block size-3 rounded-full" style={{ ...STYLE[look], boxShadow: "none" }} />;

/**
 * Journey chain (prototype "Journey" card): the 12 happy-path states as a horizontal chip chain plus the 5 exits.
 * Visited / current come from the real `steps`, never from the state's index.
 */
export function JourneyGraph({ steps, current }: { steps: WorkflowStep[]; current: WorkflowState }) {
  const visits = new Map<WorkflowState, number>();
  for (const s of steps) {
    visits.set(s.to_state, (visits.get(s.to_state) ?? 0) + 1);
    if (s.from_state && !visits.has(s.from_state)) visits.set(s.from_state, 1);
  }
  if (!visits.has(current)) visits.set(current, 1);

  const look = (st: WorkflowState): Look =>
    st === current ? (BAD.has(st) ? "failed" : "current") : visits.has(st) ? (BAD.has(st) ? "visited-bad" : "visited") : "idle";

  return (
    <section aria-label="Journey" className="rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card">
      <Eyebrow>Journey</Eyebrow>
      <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {MAIN.map((st, i) => (
          <li key={st} className="inline-flex items-center gap-1.5">
            <Chip state={st} look={look(st)} visits={visits.get(st) ?? 0} />
            {i < MAIN.length - 1 && <ChevronRight aria-hidden className="size-[13px] text-t4" />}
          </li>
        ))}
      </ol>
      <ol className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Exit states">
        <li className="eyebrow mr-1 text-[10.5px]">Exits</li>
        {EXITS.map((st) => (
          <li key={st}>
            <Chip state={st} look={look(st)} visits={visits.get(st) ?? 0} />
          </li>
        ))}
      </ol>
      <p className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-t3">
        <span className="inline-flex items-center gap-1.5">
          <Swatch look="current" /> Current state
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch look="visited" /> Visited
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch look="failed" /> Failed or blocked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch look="idle" /> Not reached
        </span>
      </p>
    </section>
  );
}
