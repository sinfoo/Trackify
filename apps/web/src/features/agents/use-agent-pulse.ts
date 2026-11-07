"use client";

import { useEffect, useRef, useState } from "react";
import { useEvents } from "@/hooks/use-events";
import type { AppEvent } from "@/lib/types";

// Communication paths of docs/AGENT_SYSTEM.md. Every one is a persisted agent_messages row in the backend.
export const COMM_EDGES = [
  { id: "orch-sec", source: "orchestrator", target: "security", label: "SCREEN_INPUT" },
  { id: "orch-sales", source: "orchestrator", target: "sales", label: "CUSTOMER_TURN" },
  { id: "sales-int", source: "sales", target: "intelligence", label: "INTERACTION_RESULT" },
  { id: "int-str", source: "intelligence", target: "strategy", label: "CUSTOMER_INSIGHT" },
  { id: "orch-pay", source: "orchestrator", target: "payment", label: "CREATE_PAYMENT_SESSION" },
  { id: "pay-sec", source: "payment", target: "security", label: "ASSESS_PAYMENT / RISK_DECISION", both: true },
  { id: "pay-ana", source: "payment", target: "analyst", label: "PAYMENT_RESULT" },
  { id: "ana-str", source: "analyst", target: "strategy", label: "METRICS_UPDATED" },
  { id: "pay-human", source: "payment", target: "human", label: "approval.request" },
] as const;

export type CommEdgeId = (typeof COMM_EDGES)[number]["id"];

// Events carry no message_type, so map (event type, agent, task) onto the path that caused it.
const EDGE_FOR: Record<string, CommEdgeId> = {
  "agent.started:security:screen_message": "orch-sec",
  "agent.started:sales:reply": "orch-sales",
  "agent.started:intelligence:analyze_conversation": "sales-int",
  "agent.completed:intelligence:analyze_conversation": "int-str",
  "agent.started:payment:create_session": "orch-pay",
  "agent.started:security:assess_payment": "pay-sec",
  "agent.started:payment:process_payment": "pay-sec",
  "agent.completed:payment:process_payment": "pay-ana",
  "agent.started:analyst:update_metrics": "pay-ana",
  "agent.completed:analyst:update_metrics": "ana-str",
  "approval.requested:payment:": "pay-human",
};

export function edgeForEvent(e: AppEvent): CommEdgeId | undefined {
  const task = typeof e.data?.task_type === "string" ? e.data.task_type : "";
  return EDGE_FOR[`${e.type}:${e.agent_id ?? ""}:${task}`] ?? (e.type === "approval.requested" ? "pay-human" : undefined);
}

const STEP_MS = 280; // replay cadence: a whole scenario lands in ~100ms, spread it so the eye can follow
const GLOW_MS = 2200;

export interface Pulse {
  /** Agents (and "orchestrator" / "human") that acted in the last ~2s of replayed events. */
  nodes: Set<string>;
  edges: Set<CommEdgeId>;
  /** Agents with an agent.started not yet matched by completed/failed. */
  running: Set<string>;
  /** Last replayed event, for captions. */
  last: AppEvent | null;
}

/**
 * Replays newly arrived live events one by one so nodes and edges light up in sequence.
 * Events present at mount are history and are not replayed.
 */
export function useAgentPulse(): Pulse {
  const { events } = useEvents();
  const seen = useRef<number | null>(null);
  const queue = useRef<AppEvent[]>([]);
  const [glow, setGlow] = useState<{ e: AppEvent; at: number }[]>([]);
  const [running, setRunning] = useState<Map<string, string>>(new Map()); // execution_id -> agent

  useEffect(() => {
    const maxId = events[0]?.id ?? 0;
    // The provider's first batch after a hard load is a catch-up poll of history: never replay it.
    if (seen.current === null) {
      if (!events.length) return;
      seen.current = maxId;
      return;
    }
    const fresh = events.filter((e) => e.id > seen.current!).sort((a, b) => a.id - b.id);
    if (fresh.length) {
      queue.current.push(...fresh);
      seen.current = maxId;
    }
  }, [events]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const next = queue.current.shift();
      setGlow((g) => {
        const kept = g.filter((x) => now - x.at < GLOW_MS);
        return next ? [...kept, { e: next, at: now }] : kept.length === g.length ? g : kept;
      });
      if (next?.type.startsWith("agent.") && next.agent_id) {
        const exId = String(next.data?.execution_id ?? next.id);
        setRunning((m) => {
          const copy = new Map(m);
          if (next.type === "agent.started") copy.set(exId, next.agent_id!);
          else copy.delete(exId);
          return copy;
        });
      }
    }, STEP_MS);
    return () => clearInterval(t);
  }, []);

  const nodes = new Set<string>();
  const edges = new Set<CommEdgeId>();
  for (const { e } of glow) {
    if (e.agent_id) nodes.add(e.agent_id);
    const edge = edgeForEvent(e);
    if (edge) {
      edges.add(edge);
      const def = COMM_EDGES.find((x) => x.id === edge)!;
      nodes.add(def.source);
      if (edge === "pay-human") nodes.add("human");
    }
  }
  return { nodes, edges, running: new Set(running.values()), last: glow.at(-1)?.e ?? null };
}
