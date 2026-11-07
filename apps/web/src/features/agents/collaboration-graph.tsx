"use client";

import "@xyflow/react/dist/style.css";
import { MarkerType, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { UserCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { AgentAvatar, AGENT_META } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { pickHandles, SideHandles } from "./flow-handles";
import { COMM_EDGES, type Pulse } from "./use-agent-pulse";

type AgentNodeData = { agentId: string; label: string; active: boolean; hub?: boolean };

const POS: Record<string, { x: number; y: number }> = {
  orchestrator: { x: 0, y: 0 },
  sales: { x: -300, y: -170 },
  intelligence: { x: 0, y: -260 },
  strategy: { x: 300, y: -170 },
  security: { x: -330, y: 90 },
  analyst: { x: 330, y: 90 },
  payment: { x: 0, y: 200 },
  human: { x: 0, y: 350 },
};


function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  return (
    <div
      className={cn(
        "flex w-[168px] items-center gap-2 rounded-xl border bg-card px-2.5 py-2 shadow-xs transition-[box-shadow,border-color] duration-200 ease-out",
        data.hub && "border-foreground/30",
        data.active && "border-primary ring-3 ring-primary/40",
      )}
    >
      {data.agentId === "human" ? (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <UserCheck aria-hidden className="size-4.5" />
        </span>
      ) : (
        <AgentAvatar agentId={data.agentId} />
      )}
      <span className="min-w-0 text-sm leading-tight font-medium">{data.label}</span>
      <SideHandles />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

export function CollaborationGraph({ pulse, height = 520 }: { pulse: Pulse; height?: number }) {
  const { resolvedTheme } = useTheme();

  const nodes: Node<AgentNodeData>[] = Object.entries(POS).map(([id, position]) => ({
    id,
    type: "agent",
    position,
    origin: [0.5, 0.5],
    data: {
      agentId: id,
      label: id === "human" ? "Human approver" : (AGENT_META[id]?.name ?? id),
      active: pulse.nodes.has(id) || pulse.running.has(id),
      hub: id === "orchestrator",
    },
  }));

  const edges: Edge[] = COMM_EDGES.map((e) => {
    const on = pulse.edges.has(e.id);
    const color = on ? "var(--primary)" : "var(--muted-foreground)";
    const marker = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      ...pickHandles(POS[e.source], POS[e.target]),
      type: "straight",
      label: e.label,
      animated: on,
      markerEnd: marker,
      markerStart: "both" in e ? marker : undefined,
      style: { stroke: color, strokeWidth: on ? 2.5 : 1.25, opacity: on ? 1 : 0.55, transition: "stroke 200ms ease-out" },
      labelStyle: { fill: on ? "var(--foreground)" : "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-geist-mono)" },
      labelBgStyle: { fill: "var(--card)" },
      labelBgPadding: [4, 2] as [number, number],
    };
  });

  return (
    <div style={{ height }} className="rounded-xl border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        style={{ background: "transparent" }}
        aria-label="Agent collaboration diagram"
      />
    </div>
  );
}
