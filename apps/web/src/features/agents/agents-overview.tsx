"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AgentAvatar, ErrorState, PageHeader, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import type { AgentView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CollaborationGraph } from "./collaboration-graph";
import { displayStatus, useAgents } from "./hooks";
import { COMM_EDGES, useAgentPulse } from "./use-agent-pulse";

export function AgentStatus({ agent, active }: { agent: AgentView; active: boolean }) {
  const status = displayStatus(agent, active);
  return (
    <span className="inline-flex items-center gap-2">
      {status === "RUNNING" && (
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-info" />
        </span>
      )}
      <StatusBadge status={status} label={status === "RUNNING" && agent.status !== "RUNNING" ? "Active now" : undefined} />
    </span>
  );
}

export function ToolChips({ tools, className }: { tools: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Allowed tools">
      {tools.map((t) => (
        <li key={t} className="num rounded-md border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
          {t}
        </li>
      ))}
    </ul>
  );
}

function RosterRow({ agent, active }: { agent: AgentView; active: boolean }) {
  const s = agent.stats ?? { succeeded: 0, failed: 0, avg_ms: 0 };
  return (
    <li>
      <Link
        href={`/agents/${agent.id}`}
        className="grid gap-x-6 gap-y-3 px-4 py-4 transition-colors duration-150 ease-out hover:bg-muted/50 focus-visible:bg-muted/50 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-center"
      >
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar agentId={agent.id} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold">{agent.name}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <AgentStatus agent={agent} active={active} />
          <p className="truncate text-sm text-muted-foreground">
            {agent.current_task ? <span className="num">{agent.current_task}</span> : "No task in progress"}
          </p>
          <p className="text-xs text-muted-foreground">
            Last run <TimeAgo date={agent.last_run_at} />
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm lg:grid-cols-1 lg:gap-0.5">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">OK</dt>
            <dd className="num font-medium text-success-text">{formatNumber(s.succeeded)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Failed</dt>
            <dd className={cn("num font-medium", s.failed ? "text-danger-text" : "text-muted-foreground")}>
              {formatNumber(s.failed)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Avg</dt>
            <dd className="num font-medium">{formatNumber(s.avg_ms)} ms</dd>
          </div>
        </dl>
        <ToolChips tools={agent.tools ?? []} />
        <ChevronRight aria-hidden className="hidden size-4 text-muted-foreground lg:block" />
      </Link>
    </li>
  );
}

export function AgentsOverview() {
  const agents = useAgents();
  const pulse = useAgentPulse();

  return (
    <>
      <PageHeader
        title="Agents"
        description="Six specialised agents coordinated by the orchestrator. Each one only reaches the tools it is allowed to."
      />

      <section aria-labelledby="roster-h" className="mb-8">
        <h2 id="roster-h" className="sr-only">
          Agent roster
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden gap-x-6 border-b px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_16px]">
            <span>Agent</span>
            <span>Status</span>
            <span>Runs</span>
            <span>Allowed tools</span>
            <span />
          </div>
          {agents.error ? (
            <ErrorState error={agents.error} onRetry={() => agents.refetch()} className="m-4" />
          ) : agents.isPending ? (
            <ul className="divide-y">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-5">
                  <Skeleton className="size-12" />
                  <Skeleton className="h-4 w-64" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y">
              {agents.data.map((a) => (
                <RosterRow key={a.id} agent={a} active={pulse.running.has(a.id) || pulse.nodes.has(a.id)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="collab-h">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="collab-h" className="text-lg font-semibold">
              How they collaborate
            </h2>
            <p className="text-sm text-muted-foreground">
              Paths light up as live events arrive. Run a scenario from Demo control to watch a full journey.
            </p>
          </div>
          <p className="min-h-5 truncate text-sm text-muted-foreground" aria-live="polite">
            {pulse.last ? pulse.last.summary : "Waiting for agent activity"}
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <CollaborationGraph pulse={pulse} />
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Message paths</h3>
            <ol className="space-y-1.5 text-sm">
              {COMM_EDGES.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "rounded-md px-2 py-1 transition-colors duration-200 ease-out",
                    pulse.edges.has(e.id) && "bg-primary/15",
                  )}
                >
                  <span className="font-medium capitalize">{e.source}</span>
                  <span className="text-muted-foreground">{"both" in e ? " ⇄ " : " → "}</span>
                  <span className="font-medium capitalize">{e.target === "human" ? "Human approver" : e.target}</span>
                  <span className="num block text-xs text-muted-foreground">{e.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
