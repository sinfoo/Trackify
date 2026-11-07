"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { AgentAvatar, AGENT_META, EmptyState, ErrorState, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, type EventsStatus } from "@/hooks/use-events";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AppEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgentStatus } from "@/features/agents/agents-overview";
import { useAgents } from "@/features/agents/hooks";
import { useAgentPulse } from "@/features/agents/use-agent-pulse";
import { EVENT_GROUPS, EventRow, eventGroup, type EventGroup } from "./event-row";

const AGENT_IDS = ["orchestrator", "sales", "intelligence", "payment", "analyst", "strategy", "security"];

const CONN: Record<EventsStatus, { label: string; cls: string; dot: string }> = {
  live: { label: "Live", cls: "border-success/30 bg-success/10 text-success-text", dot: "bg-success" },
  polling: { label: "Polling every 4s", cls: "border-warning/30 bg-warning/15 text-warning-text", dot: "bg-warning" },
  offline: { label: "Offline", cls: "border-danger/30 bg-danger/10 text-danger-text", dot: "bg-danger" },
};

export function ConnectionBadge() {
  const { status } = useEvents();
  const c = CONN[status];
  return (
    <span role="status" className={cn("inline-flex h-7 items-center gap-2 rounded-full border px-3 text-sm font-medium", c.cls)}>
      <span aria-hidden className={cn("size-2 rounded-full", c.dot, status === "live" && "animate-pulse")} />
      {c.label}
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm capitalize transition-colors duration-150 ease-out",
        on ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(set: Set<T>, v: T) => {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
};

export function ActivityFeed() {
  const { events: live } = useEvents();
  const history = useQuery({
    queryKey: [...qk.events, "history"],
    queryFn: () => api.get<AppEvent[]>("/events", { query: { limit: 200 } }),
    staleTime: Infinity,
  });
  const [groups, setGroups] = useState<Set<EventGroup>>(new Set());
  const [agents, setAgents] = useState<Set<string>>(new Set());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const historyMax = useMemo(() => Math.max(0, ...(history.data ?? []).map((e) => e.id)), [history.data]);

  const merged = useMemo(() => {
    const byId = new Map<number, AppEvent>();
    for (const e of history.data ?? []) byId.set(e.id, e);
    for (const e of live) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, 400);
  }, [history.data, live]);

  const filtered = merged.filter(
    (e) => (!groups.size || groups.has(eventGroup(e.type)!)) && (!agents.size || agents.has(e.agent_id ?? "")),
  );
  const visible = pausedAt === null ? filtered : filtered.filter((e) => e.id <= pausedAt);
  const pending = filtered.length - visible.length;
  const topId = visible[0]?.id;

  useEffect(() => {
    if (pausedAt === null) listRef.current?.scrollTo({ top: 0 });
  }, [topId, pausedAt]);

  return (
    <>
      <PageHeader
        title="Live activity"
        description="Every agent action, workflow move, payment and alert as it happens."
        actions={<ConnectionBadge />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Event stream" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-muted-foreground">Type</span>
            {EVENT_GROUPS.map((g) => (
              <Chip key={g} on={groups.has(g)} onClick={() => setGroups((s) => toggle(s, g))}>
                {g}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-muted-foreground">Agent</span>
            {AGENT_IDS.map((a) => (
              <Chip key={a} on={agents.has(a)} onClick={() => setAgents((s) => toggle(s, a))}>
                <AgentAvatar agentId={a} size="sm" className="-ml-2" />
                {AGENT_META[a]?.name ?? a}
              </Chip>
            ))}
            {(groups.size > 0 || agents.size > 0) && (
              <Button variant="ghost" size="sm" onClick={() => {
                  setGroups(new Set());
                  setAgents(new Set());
                }}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <span className="num text-sm text-muted-foreground">{visible.length} events</span>
              <div className="flex items-center gap-2">
                {pending > 0 && (
                  <Button size="sm" onClick={() => setPausedAt(null)}>
                    {pending} new
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPausedAt((p) => (p === null ? (merged[0]?.id ?? 0) : null))}
                  aria-pressed={pausedAt !== null}
                >
                  {pausedAt === null ? <Pause aria-hidden /> : <Play aria-hidden />}
                  {pausedAt === null ? "Pause" : "Resume"}
                </Button>
              </div>
            </div>
            <div ref={listRef} className="max-h-[70vh] overflow-y-auto">
              {history.error ? (
                <ErrorState error={history.error} onRetry={() => history.refetch()} className="m-4" />
              ) : history.isPending && !live.length ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <EmptyState title="No events match" description="Change the filters or run a demo scenario." className="m-4" />
              ) : (
                <ol className="divide-y" aria-live={pausedAt === null ? "polite" : "off"}>
                  {visible.map((e) => (
                    <EventRow key={e.id} e={e} fresh={e.id > historyMax} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
        <NowRunning />
      </div>
    </>
  );
}

function NowRunning() {
  const agents = useAgents(3000);
  const pulse = useAgentPulse();
  const active = (agents.data ?? []).filter((a) => a.status === "RUNNING" || pulse.running.has(a.id) || pulse.nodes.has(a.id));
  return (
    <aside aria-label="Now running" className="h-fit rounded-xl border bg-card p-4 xl:sticky xl:top-20">
      <h2 className="mb-3 font-semibold">Now running</h2>
      {agents.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">All agents idle. Activity appears here the moment an agent is dispatched.</p>
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {active.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <AgentAvatar agentId={a.id} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.name}</p>
                <AgentStatus agent={a} active />
                {a.current_task && <p className="num mt-1 truncate text-xs text-muted-foreground">{a.current_task}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pulse.last && (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Latest: <span className="text-foreground">{pulse.last.summary}</span>
        </p>
      )}
    </aside>
  );
}
