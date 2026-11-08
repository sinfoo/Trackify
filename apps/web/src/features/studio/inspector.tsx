"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, CircleDashed, ExternalLink, Info, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENT_META, AgentAvatar, EmptyState, StatusBadge, TimeAgo, humanize } from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { qk } from "@/lib/queries";
import type { AppEvent, Conversation, Insight, Paged, Workflow, WorkflowDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIX = ["security", "sales", "intelligence", "payment", "analyst", "strategy"] as const;
const DOING: Record<(typeof SIX)[number], string> = {
  security: "screened",
  sales: "replied",
  intelligence: "analysed",
  payment: "charged",
  analyst: "reported",
  strategy: "advised",
};

/** Workflow for a conversation: the admin conversation endpoint first, then a scan of recent workflows. */
function useConversationWorkflow(conversationId: string) {
  const conv = useQuery({
    queryKey: [...qk.conversations, conversationId],
    queryFn: () => api.get<Conversation>(`/conversations/${conversationId}`),
    retry: false,
  });
  const needFallback = conv.isError || (conv.isSuccess && !conv.data.workflow);
  const scan = useQuery({
    queryKey: [...qk.workflows, "by-conversation", conversationId],
    queryFn: async () => {
      const page = await api.get<Paged<Workflow>>("/workflows", { query: { page_size: 50 } });
      return page.items.find((w) => w.conversation_id === conversationId) ?? null;
    },
    enabled: needFallback,
    // The workflow is created with the conversation; retry briefly in case we raced it.
    refetchInterval: (q) => (q.state.data ? false : 3000),
  });
  const workflowId = conv.data?.workflow?.id ?? scan.data?.id ?? null;
  return {
    conv,
    workflowId,
    loading: conv.isLoading || (needFallback && scan.isLoading),
    convUnavailable: conv.isError && conv.error instanceof ApiError && conv.error.status === 404,
  };
}

export function StudioInspector({ conversationId }: { conversationId: string | null }) {
  if (!conversationId)
    return (
      <EmptyState
        icon={WorkflowIcon}
        title="No customer session yet"
        description="Start a conversation in the chat. The workflow, agent activity and customer insight appear here live."
        className="h-full"
      />
    );
  return <Inspector key={conversationId} conversationId={conversationId} />;
}

function Inspector({ conversationId }: { conversationId: string }) {
  const { conv, workflowId, loading, convUnavailable } = useConversationWorkflow(conversationId);
  const wf = useQuery({
    queryKey: [...qk.workflows, workflowId],
    queryFn: () => api.get<WorkflowDetail>(`/workflows/${workflowId}`),
    enabled: !!workflowId,
  });
  const history = useQuery({
    queryKey: [...qk.workflows, workflowId, "events"],
    queryFn: () => api.get<AppEvent[]>(`/workflows/${workflowId}/events`),
    enabled: !!workflowId,
  });
  const { events: live, status } = useEvents();

  const txId = wf.data?.transaction_id;
  const events = useMemo(() => {
    const mine = live.filter(
      (e) => (workflowId && e.workflow_id === workflowId) || (txId && (e.data as { transaction_id?: string })?.transaction_id === txId),
    );
    const byId = new Map<number, AppEvent>();
    for (const e of [...(history.data ?? []), ...mine]) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.id - a.id);
  }, [live, history.data, workflowId, txId]);

  // Insight is written after the reply (intelligence agent) and after payments; refresh it on each new event for this journey.
  const qc = useQueryClient();
  const newest = events[0]?.id;
  useEffect(() => {
    if (newest) void qc.invalidateQueries({ queryKey: [...qk.conversations, conversationId] });
  }, [newest, qc, conversationId]);

  if (loading) return <InspectorSkeleton />;
  if (!workflowId)
    return (
      <EmptyState
        title="Looking for this conversation's workflow"
        description="The orchestrator opens one per conversation. If this persists, check the API is running."
      />
    );

  const w = wf.data;
  const insight = conv.data?.insight ?? null;
  const participated = new Set(events.map((e) => e.agent_id).filter(Boolean));

  return (
    <div className="grid gap-4">
      <Panel
        title="Workflow"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/workflows/${workflowId}`}>
              Open visualizer <ExternalLink aria-hidden />
            </Link>
          </Button>
        }
      >
        {w ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={w.state} className="h-7 px-3 text-sm" />
              <span className="text-sm text-muted-foreground">{w.label}</span>
            </div>
            <ol className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="State history">
              {w.steps.slice(-6).map((s, i) => (
                <li key={s.id} className="inline-flex items-center gap-1">
                  {i > 0 && <ArrowRight aria-hidden className="size-3" />}
                  <span title={s.note ?? undefined}>{humanize(s.to_state)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <Skeleton className="h-7 w-48" />
        )}
      </Panel>

      <Panel title="Agents on this conversation" action={<LiveDot status={status} />}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
          {SIX.map((id) => {
            const on = participated.has(id);
            return (
              <li
                key={id}
                className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-center", on ? "bg-card" : "border-dashed opacity-60")}
              >
                <AgentAvatar agentId={id} size="sm" />
                <span className="text-xs font-medium">{AGENT_META[id].name}</span>
                <span className={cn("inline-flex items-center gap-0.5 text-xs", on ? "text-success-text" : "text-muted-foreground")}>
                  {on ? <CircleCheck aria-hidden className="size-3" /> : <CircleDashed aria-hidden className="size-3" />}
                  {on ? DOING[id] : "waiting"}
                </span>
              </li>
            );
          })}
        </ul>
        <ol className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1" aria-label="Agent activity, newest first" aria-live="polite">
          {events.slice(0, 40).map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-sm">
              {e.agent_id ? (
                <AgentAvatar agentId={e.agent_id} size="sm" />
              ) : (
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted" aria-hidden>
                  <WorkflowIcon className="size-3.5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="[overflow-wrap:anywhere]">{e.summary}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="num">{e.type}</span> · <TimeAgo date={e.created_at} />
                </p>
              </div>
            </li>
          ))}
          {!events.length && <li className="text-sm text-muted-foreground">No activity yet.</li>}
        </ol>
      </Panel>

      <InsightPanel insight={insight} workflow={w} unavailable={convUnavailable} />

      <Panel title="Agent-to-agent messages">
        {w?.messages.length ? (
          <ol className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            {[...w.messages].reverse().slice(0, 30).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <AgentAvatar agentId={m.from_agent} size="sm" />
                <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
                <AgentAvatar agentId={m.to_agent} size="sm" />
                <span className="num text-xs font-medium">{m.message_type}</span>
                <span className="text-xs text-muted-foreground">
                  {AGENT_META[m.from_agent]?.name ?? m.from_agent} to {AGENT_META[m.to_agent]?.name ?? m.to_agent}
                </span>
                <TimeAgo date={m.created_at} className="ml-auto text-xs text-muted-foreground" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{w ? "No hand-offs yet." : "Loading"}</p>
        )}
      </Panel>
    </div>
  );
}

function InsightPanel({ insight, workflow, unavailable }: { insight: Insight | null; workflow?: WorkflowDetail; unavailable: boolean }) {
  // Fallback when the admin conversation endpoint is unavailable: the orchestrator mirrors key signals in workflow.context.
  const ctx = (workflow?.context ?? {}) as { purchase_intent?: number; objections?: string[]; last_intent?: string };
  const intent = insight?.purchase_intent ?? ctx.purchase_intent ?? null;
  const objections = insight?.objections ?? ctx.objections ?? [];
  return (
    <Panel title="Customer intelligence" action={<span className="text-xs text-muted-foreground">Model estimate</span>}>
      {intent === null ? (
        <p className="text-sm text-muted-foreground">The intelligence agent has not analysed this conversation yet.</p>
      ) : (
        <div className="grid gap-4">
          <IntentMeter value={intent} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact label="Sentiment">{insight?.sentiment_label ? humanize(insight.sentiment_label.toUpperCase()) : "-"}</Fact>
            <Fact label="Stage">{insight?.journey_stage ? humanize(insight.journey_stage.toUpperCase()) : ctx.last_intent ? `Last intent: ${ctx.last_intent}` : "-"}</Fact>
            <Fact label="Objections" wide>
              {objections.length ? (
                <span className="flex flex-wrap gap-1">
                  {objections.map((o) => (
                    <span key={o} className="rounded-full border px-2 py-0.5 text-xs">
                      {humanize(o.toUpperCase())}
                    </span>
                  ))}
                </span>
              ) : (
                "None raised"
              )}
            </Fact>
            {insight?.recommended_follow_up && (
              <Fact label="Recommended follow-up" wide>
                {insight.recommended_follow_up}
              </Fact>
            )}
          </dl>
          {!insight && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {unavailable
                ? "Full insight needs GET /conversations/{id}, which is not available on this API yet. Showing the workflow's summary signals."
                : "Showing the workflow's summary signals."}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function IntentMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const band = pct >= 0.66 ? "High" : pct >= 0.33 ? "Medium" : "Low";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Purchase intent</span>
        <span className="num text-2xl font-semibold">
          {formatPercent(pct, { digits: 0 })} <span className="text-sm font-normal text-muted-foreground">{band}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Purchase intent"
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LiveDot({ status }: { status: string }) {
  const label = status === "live" ? "Live" : status === "polling" ? "Polling" : "Offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", status === "live" ? "bg-success" : status === "polling" ? "bg-warning" : "bg-muted-foreground")} />
      {label}
    </span>
  );
}

function InspectorSkeleton() {
  return (
    <div className="grid gap-4" aria-busy>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
