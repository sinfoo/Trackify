"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { AGENT_META, agentColors, agentMeta, EmptyState, ErrorState, Eyebrow, PageTitle } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents, type EventsStatus } from "@/hooks/use-events";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AppEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAgents } from "@/features/agents/hooks";
import { useAgentPulse } from "@/features/agents/use-agent-pulse";
import { EVENT_GROUPS, EventRow, eventGroup, type EventGroup } from "./event-row";
import { FilterChip } from "./filter-chip";

const AGENT_IDS = ["orchestrator", "sales", "intelligence", "payment", "analyst", "strategy", "security"];
const CARD = "rounded-[22px] border border-hair bg-panel shadow-card";

const CONN: Record<EventsStatus, { label: string; cls: string; dot: string }> = {
  live: { label: "WebSocket connected", cls: "bg-success-bg text-success", dot: "bg-[#3DCB8B] anim-live-pip" },
  polling: { label: "Polling every 4s", cls: "bg-warning-bg text-warning", dot: "bg-warning" },
  offline: { label: "Offline", cls: "bg-danger-bg text-danger", dot: "bg-danger" },
};

/** Prototype live pill: 36px, success tint, pulsing dot. */
export function ConnectionBadge() {
  const { status } = useEvents();
  const c = CONN[status];
  return (
    <span role="status" className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap", c.cls)}>
      <span aria-hidden className={cn("size-2 rounded-full", c.dot)} />
      {c.label}
    </span>
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
      <PageTitle title="Live activity" description="Every agent action, workflow move, payment and alert as it happens." actions={<ConnectionBadge />} />
      <div className="flex flex-wrap items-start gap-[18px]">
        <section aria-label="Event stream" className="flex min-w-0 flex-[3_1_560px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1 font-extrabold">Type</span>
            {EVENT_GROUPS.map((g) => (
              <FilterChip key={g} size={32} on={groups.has(g)} onClick={() => setGroups((s) => toggle(s, g))} className="capitalize">
                {g}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1 font-extrabold">Agent</span>
            {AGENT_IDS.map((a) => {
              const on = agents.has(a);
              const Icon = agentMeta(a).icon;
              return (
                <FilterChip key={a} size={32} on={on} onClick={() => setAgents((s) => toggle(s, a))} className="pl-[5px]">
                  <span
                    aria-hidden
                    className="grid size-[22px] place-items-center rounded-[7px]"
                    style={on ? { background: "rgba(255,255,255,.15)", color: "var(--bg)" } : agentColors(a)}
                  >
                    <Icon className="size-3" strokeWidth={2.2} />
                  </span>
                  {AGENT_META[a]?.name ?? a}
                </FilterChip>
              );
            })}
            {(groups.size > 0 || agents.size > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGroups(new Set());
                  setAgents(new Set());
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-center justify-between gap-2 px-[18px] py-2.5">
              <span className="num text-[12.5px] text-t3">
                {visible.length} events · newest first
              </span>
              <div className="flex items-center gap-2">
                {pending > 0 && (
                  <Button size="sm" onClick={() => setPausedAt(null)}>
                    {pending} new
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[30px] rounded-[9px] text-[12.5px] text-t2"
                  onClick={() => setPausedAt((p) => (p === null ? (merged[0]?.id ?? 0) : null))}
                  aria-pressed={pausedAt !== null}
                >
                  {pausedAt === null ? <Pause aria-hidden className="size-3" strokeWidth={2.4} /> : <Play aria-hidden className="size-3" strokeWidth={2.4} />}
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
                <EmptyState title="No events match" description="Change the filters or run a scenario from Demo control." className="m-4" />
              ) : (
                <ol aria-live={pausedAt === null ? "polite" : "off"}>
                  {visible.map((e) => (
                    <EventRow key={e.id} e={e} fresh={e.id > historyMax} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-[18px]">
          <NowRunning />
          <LastHour events={merged} />
        </aside>
      </div>
    </>
  );
}

function NowRunning() {
  const agents = useAgents(3000);
  const pulse = useAgentPulse();
  const active = (agents.data ?? []).filter((a) => a.status === "RUNNING" || pulse.running.has(a.id) || pulse.nodes.has(a.id));
  return (
    <section aria-label="Now running" className={cn(CARD, "px-5 py-[18px]")}>
      <Eyebrow>Now running</Eyebrow>
      {agents.isPending ? (
        <Skeleton className="mt-2.5 h-10 w-full" />
      ) : (
        <ul className="mt-2.5 grid gap-2.5" aria-live="polite">
          {active.map((a) => {
            const m = agentMeta(a.id);
            const Icon = m.icon;
            return (
              <li key={a.id} className="anim-row-in flex items-center gap-3">
                <span className="relative grid size-[38px] shrink-0 place-items-center rounded-xl" style={agentColors(a.id)}>
                  <Icon aria-hidden className="size-[17px]" strokeWidth={2} />
                  <span aria-hidden className="anim-halo absolute -inset-[3px] rounded-[15px] border-2" style={{ borderColor: `var(${m.color})` }} />
                </span>
                <span className="min-w-0 leading-[1.2]">
                  <span className="block text-sm font-extrabold">{m.full}</span>
                  <span className="num mt-0.5 block truncate text-[11.5px]" style={{ color: `var(${m.color})` }}>
                    {a.current_task ?? "dispatching"}
                  </span>
                </span>
              </li>
            );
          })}
          {active.length === 0 && <li className="text-[13px] text-t3">All agents idle. They light up the moment the orchestrator dispatches one.</li>}
        </ul>
      )}
      {pulse.last && (
        <p className="mt-3.5 border-t border-hair pt-3 text-xs text-t3">
          Latest: <span className="text-text">{pulse.last.summary}</span>
        </p>
      )}
    </section>
  );
}

const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const BUCKETS = 24;
const HOUR = 3_600_000;

/** 24 bars (2.5 min each) over the last hour, computed from the events we hold; the current bucket is amber. */
function LastHour({ events }: { events: AppEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const start = now - HOUR;
  const bars = new Array<number>(BUCKETS).fill(0);
  let alerts = 0;
  let approvals = 0;
  for (const e of events) {
    if (e.type === "security.alert") alerts++;
    if (e.type === "approval.requested") approvals++;
    const t = new Date(e.created_at).getTime();
    if (t >= start && t <= now) bars[Math.min(BUCKETS - 1, Math.floor(((t - start) / HOUR) * BUCKETS))]++;
  }
  const max = Math.max(1, ...bars);
  return (
    <section aria-label="Last hour" className={cn(CARD, "px-5 py-[18px]")}>
      <Eyebrow>Last hour</Eyebrow>
      <div className="mt-2.5 flex h-16 items-end gap-[3px]" aria-hidden>
        {bars.map((v, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-t-[3px] transition-[height] duration-500", i === BUCKETS - 1 ? "bg-brand" : "bg-panel3")}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="tabular mt-1.5 flex justify-between text-[11px] text-t4">
        <span>{hhmm.format(start)}</span>
        <span>{hhmm.format(now - HOUR / 2)}</span>
        <span>{hhmm.format(now)}</span>
      </div>
      <p className="mt-3 text-[13px] text-t2">
        <span className="font-extrabold text-text">{events.length}</span> events · <span className="font-extrabold text-text">{alerts}</span> alerts ·{" "}
        <span className="font-extrabold text-text">{approvals}</span> approvals requested
      </p>
    </section>
  );
}
