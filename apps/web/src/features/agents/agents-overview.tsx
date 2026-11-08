"use client";

import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { agentColors, agentMeta, ErrorState, Eyebrow, PageTitle, StatusBadge, Tile } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { NEVER, type ActorId } from "@/lib/fixtures";
import type { AgentView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { displayStatus, useAgents } from "./hooks";
import { OrchestrationCanvas } from "./orchestration-canvas";
import { useScenarioClock } from "./scenario-clock";
import { COMM_EDGES, useAgentPulse } from "./use-agent-pulse";

/** Prototype "Message paths" (who talks to whom). Highlighted when the scenario step or a live event travels it. */
const PATHS: [ActorId, ActorId, string][] = [
  ["orchestrator", "security", "SCREEN_INPUT"],
  ["orchestrator", "sales", "CUSTOMER_TURN"],
  ["sales", "intelligence", "INTERACTION_RESULT"],
  ["intelligence", "strategy", "CUSTOMER_INSIGHT"],
  ["orchestrator", "payment", "CREATE_PAYMENT_SESSION"],
  ["payment", "security", "ASSESS_PAYMENT / RISK_DECISION"],
  ["payment", "analyst", "PAYMENT_RESULT"],
  ["analyst", "strategy", "METRICS_UPDATED"],
  ["payment", "human", "approval.request"],
  ["human", "payment", "HUMAN_RELEASE"],
];

export function AgentStatus({ agent, active }: { agent: AgentView; active: boolean }) {
  const status = displayStatus(agent, active);
  return <StatusBadge status={status} label={status === "RUNNING" ? "Running" : undefined} className="font-extrabold" />;
}

/** Scenario clock + live events: the agents that act right now. */
function useActiveAgents() {
  const pulse = useAgentPulse();
  const clock = useScenarioClock();
  const active = new Set<string>([...pulse.running, ...pulse.nodes]);
  active.add(clock.current.from);
  active.add(clock.current.to);
  return { active, pulse, clock };
}

function AgentCard({ agent, active }: { agent: AgentView; active: boolean }) {
  const m = agentMeta(agent.id);
  const colors = agentColors(agent.id);
  const s = agent.stats ?? { succeeded: 0, failed: 0, avg_ms: 0 };
  const provider = agent.provider ? `${agent.provider}${agent.model ? ` · ${agent.model}` : ""}` : "rules only";
  const stats: [string, number, string][] = [
    ["Succeeded", s.succeeded, "var(--success)"],
    ["Failed", s.failed, s.failed ? "var(--danger)" : "var(--t3)"],
    ["Avg ms", s.avg_ms, "var(--text)"],
  ];
  return (
    <li>
      <Link
        href={`/agents/${agent.id}`}
        className="lift flex h-full flex-col gap-3.5 rounded-[22px] border bg-panel p-[18px] text-text no-underline shadow-card hover:no-underline hover:[transform:translateY(-3px)]"
        style={active ? { borderColor: colors.color, boxShadow: `0 0 0 4px ${colors.background}` } : { borderColor: "var(--hair)" }}
      >
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-[14px]" style={colors}>
            <m.icon aria-hidden className="size-[22px]" strokeWidth={2} />
            {active && <span aria-hidden className="anim-halo absolute -inset-1 rounded-[18px] border-2" style={{ borderColor: colors.color }} />}
          </span>
          <span className="min-w-0 flex-1 leading-[1.2]">
            <span className="block text-base font-extrabold tracking-[-0.01em]">{m.full}</span>
            <span className="num mt-[3px] block truncate text-xs text-t3">{provider}</span>
          </span>
          <AgentStatus agent={agent} active={active} />
        </div>
        <p className="text-[13.5px] leading-[1.5] text-t2">{agent.description}</p>
        <dl className="grid grid-cols-3 gap-2">
          {stats.map(([k, v, color]) => (
            <div key={k} className="rounded-xl bg-panel2 px-2.5 py-2">
              <dt className="text-[10.5px] font-bold tracking-[.06em] text-t4 uppercase">{k}</dt>
              <dd className="tabular mt-0.5 text-base font-extrabold" style={{ color }}>
                {formatNumber(v)}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="flex flex-wrap gap-[5px]" aria-label="Allowed tools">
          {(agent.tools ?? []).map((t) => (
            <li key={t} className="num rounded-[7px] px-2 py-[3px] text-[11px]" style={colors}>
              {t}
            </li>
          ))}
        </ul>
      </Link>
    </li>
  );
}

export function AgentsOverview() {
  const agents = useAgents();
  const { active, pulse, clock } = useActiveAgents();
  const cur = clock.current;

  return (
    <>
      <PageTitle
        title="Agents"
        description="Six specialised agents coordinated by the orchestrator. Each reaches only the tools it is allowed to; the gateway denies and logs anything else."
        actions={
          <span className="inline-flex min-h-9 max-w-[calc(100vw-32px)] items-center gap-2 rounded-full border border-hair bg-panel px-3.5 py-1.5 text-[12.5px] font-bold text-t2 [overflow-wrap:anywhere]">
            <KeyRound aria-hidden className="size-3.5" />
            Never granted: {NEVER.slice(0, 3).join(" · ")}
          </span>
        }
      />

      {agents.error ? (
        <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
      ) : (
        <ul className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]" aria-label="Agent roster">
          {agents.isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-[236px] rounded-[22px]" />
                </li>
              ))
            : agents.data.map((a) => <AgentCard key={a.id} agent={a} active={active.has(a.id)} />)}
        </ul>
      )}

      <section aria-label="How they collaborate" className="flex flex-wrap gap-5">
        <div className="min-w-0 flex-[3_1_600px]">
          <OrchestrationCanvas compact />
        </div>
        <aside className="min-w-0 flex-[1_1_300px] rounded-[26px] border border-hair bg-panel px-5 py-[18px] shadow-card">
          <Eyebrow>Message paths</Eyebrow>
          <h2 className="mt-0.5 text-[17px] font-extrabold">Who talks to whom</h2>
          <ol className="mt-2.5">
            {PATHS.map(([f, t, label]) => {
              const edge = COMM_EDGES.find((e) => (e.source === f && e.target === t) || (e.source === t && e.target === f));
              const on = (cur.from === f && cur.to === t) || (cur.from === t && cur.to === f) || (edge !== undefined && pulse.edges.has(edge.id));
              return (
                <li
                  key={label}
                  className={cn("-mx-2.5 flex items-center gap-2.5 rounded-xl px-2.5 py-[9px] transition-colors duration-300", on && "bg-brand-bg")}
                >
                  <Tile icon={agentMeta(f).icon} size={26} radius={8} iconSize={13} {...agentColors(f)} />
                  <ArrowRight aria-hidden className="size-[13px] shrink-0 text-t4" />
                  <Tile icon={agentMeta(t).icon} size={26} radius={8} iconSize={13} {...agentColors(t)} />
                  <span className="min-w-0 flex-1 leading-[1.2]">
                    <span className="block text-[13px] font-bold">
                      {agentMeta(f).name} → {agentMeta(t).name}
                    </span>
                    <span className="num block text-[10.5px] text-t3">{label}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>
    </>
  );
}
