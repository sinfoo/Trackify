"use client";

import "@xyflow/react/dist/style.css";
import { MarkerType, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useTheme } from "next-themes";
import { humanize } from "@/components/ui-kit";
import type { WorkflowState, WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { pickHandles, SideHandles } from "@/features/agents/flow-handles";

// Hand placed snake layout of docs/WORKFLOWS.md: row 0 sales, rows 2-4 payment, back along row 2 to completion.
const COL = 215;
const ROW = 110;
const GRID: Record<WorkflowState, [number, number]> = {
  NEW_CUSTOMER: [0, 0],
  SALES_INTERACTION: [1, 0],
  CUSTOMER_ANALYSIS: [2, 0],
  PRODUCT_RECOMMENDATION: [3, 0],
  ENROLLMENT_REQUEST: [4, 0],
  LOW_INTENT: [2, 1],
  PAYMENT_FAILED: [3, 1],
  SECURITY_CHECK: [4, 2],
  PAYMENT_SESSION: [5, 2],
  PAYMENT_PROCESSING: [3, 2],
  FINANCIAL_ANALYSIS: [2, 2],
  BUSINESS_RECOMMENDATION: [1, 2],
  COMPLETED: [0, 2],
  AWAITING_APPROVAL: [4, 3],
  BLOCKED: [5, 3],
  CANCELLED: [4, 4],
  ERROR: [0, 4],
};

const MACHINE: [WorkflowState, WorkflowState][] = [
  ["NEW_CUSTOMER", "SALES_INTERACTION"],
  ["SALES_INTERACTION", "CUSTOMER_ANALYSIS"],
  ["CUSTOMER_ANALYSIS", "PRODUCT_RECOMMENDATION"],
  ["CUSTOMER_ANALYSIS", "LOW_INTENT"],
  ["CUSTOMER_ANALYSIS", "SALES_INTERACTION"],
  ["LOW_INTENT", "SALES_INTERACTION"],
  ["PRODUCT_RECOMMENDATION", "ENROLLMENT_REQUEST"],
  ["ENROLLMENT_REQUEST", "SECURITY_CHECK"],
  ["SECURITY_CHECK", "PAYMENT_SESSION"],
  ["PAYMENT_SESSION", "SECURITY_CHECK"],
  ["SECURITY_CHECK", "PAYMENT_PROCESSING"],
  ["SECURITY_CHECK", "AWAITING_APPROVAL"],
  ["SECURITY_CHECK", "BLOCKED"],
  ["AWAITING_APPROVAL", "PAYMENT_PROCESSING"],
  ["AWAITING_APPROVAL", "CANCELLED"],
  ["PAYMENT_PROCESSING", "FINANCIAL_ANALYSIS"],
  ["PAYMENT_PROCESSING", "PAYMENT_FAILED"],
  ["PAYMENT_FAILED", "SECURITY_CHECK"],
  ["FINANCIAL_ANALYSIS", "BUSINESS_RECOMMENDATION"],
  ["BUSINESS_RECOMMENDATION", "COMPLETED"],
];

const BAD = new Set<WorkflowState>(["PAYMENT_FAILED", "BLOCKED", "ERROR"]);

type StateData = { state: WorkflowState; visited: boolean; current: boolean; visits: number };

function StateNode({ data }: NodeProps<Node<StateData>>) {
  const bad = BAD.has(data.state);
  return (
    <div
      className={cn(
        "flex h-11 w-[176px] items-center justify-center gap-1.5 rounded-lg border px-2 text-center text-xs font-medium",
        !data.visited && "border-dashed bg-card text-muted-foreground",
        data.visited && !bad && "border-info/40 bg-info/10 text-info-text",
        data.visited && bad && "border-danger/50 bg-danger/12 text-danger-text",
        data.current && !bad && "border-primary bg-primary text-primary-foreground ring-3 ring-primary/35",
        data.current && bad && "border-danger bg-danger text-navy ring-3 ring-danger/35",
      )}
      aria-current={data.current ? "step" : undefined}
    >
      {humanize(data.state)}
      {data.visits > 1 && <span className="num opacity-80">×{data.visits}</span>}
      <SideHandles />
    </div>
  );
}

const nodeTypes = { state: StateNode };

export function JourneyGraph({ steps, current }: { steps: WorkflowStep[]; current: WorkflowState }) {
  const { resolvedTheme } = useTheme();
  const visits = new Map<string, number>();
  const traversed = new Set<string>();
  for (const s of steps) {
    visits.set(s.to_state, (visits.get(s.to_state) ?? 0) + 1);
    if (s.from_state) {
      if (!visits.has(s.from_state)) visits.set(s.from_state, 1);
      traversed.add(`${s.from_state}>${s.to_state}`);
    }
  }
  if (!visits.has(current)) visits.set(current, 1);

  const nodes: Node<StateData>[] = (Object.keys(GRID) as WorkflowState[]).map((st) => ({
    id: st,
    type: "state",
    position: { x: GRID[st][0] * COL, y: GRID[st][1] * ROW },
    origin: [0.5, 0.5],
    data: { state: st, visited: visits.has(st), current: st === current, visits: visits.get(st) ?? 0 },
  }));

  // ERROR and CANCELLED are reachable from anywhere: only draw those edges when actually taken.
  const pairs = [...MACHINE];
  for (const key of traversed) {
    const [a, b] = key.split(">") as [WorkflowState, WorkflowState];
    if (!pairs.some(([x, y]) => x === a && y === b) && GRID[a] && GRID[b]) pairs.push([a, b]);
  }

  const edges: Edge[] = pairs.map(([a, b]) => {
    const on = traversed.has(`${a}>${b}`);
    const bad = BAD.has(b);
    const color = on ? (bad ? "var(--danger)" : "var(--info)") : "var(--border)";
    const pa = { x: GRID[a][0], y: GRID[a][1] };
    const pb = { x: GRID[b][0], y: GRID[b][1] };
    // Return edges on the same row (analysis back to sales, or skipping a node): loop underneath, never through.
    const loop = pa.y === pb.y && pb.x < pa.x && (pa.x - pb.x > 1 || pairs.some(([x, y]) => x === b && y === a));
    return {
      id: `${a}>${b}`,
      source: a,
      target: b,
      ...pickHandles(pa, pb, loop),
      type: loop ? "smoothstep" : "straight",
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      style: { stroke: color, strokeWidth: on ? 2.25 : 1.25 },
    };
  });

  return (
    <div className="h-[460px] rounded-xl border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.3}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        style={{ background: "transparent" }}
        aria-label="Customer journey state machine"
      />
    </div>
  );
}
