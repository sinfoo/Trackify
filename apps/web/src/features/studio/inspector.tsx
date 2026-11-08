"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, ChevronRight, ShieldCheck, Workflow as WorkflowIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENT_META, AgentAvatar, Eyebrow, StatusBadge, TimeAgo, Tile, humanize } from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AppEvent, Conversation, Insight, Paged, Workflow, WorkflowDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIX = ["security", "sales", "intelligence", "payment", "analyst", "strategy"] as const;
const DOING: Record<(typeof SIX)[number], string> = { security: "screened", sales: "replied", intelligence: "analysed", payment: "charged", analyst: "reported", strategy: "advised" };

const sentimentWord = (s: string | null | undefined) => (s ? s.toLowerCase() : "unknown");

/**
 * Prototype "Intelligence agent · Customer insight" card: conic intent gauge, stage · sentiment line,
 * Needs / Motivations / Objections chip groups, "Suggested follow-up" box. Shared with the customer detail page.
 * `insight` null = not analysed yet; `fallback` fills intent/objections from workflow.context when the API has no insight row.
 */
export function IntelligenceInspector({
  insight,
  fallback,
  workflowHref,
  note,
  className,
}: {
  insight: Insight | null | undefined;
  fallback?: { purchase_intent?: number | null; objections?: string[] | null; stage?: string | null };
  workflowHref?: string;
  note?: string;
  className?: string;
}) {
  const intent = insight?.purchase_intent ?? fallback?.purchase_intent ?? null;
  const stage = insight?.journey_stage ?? fallback?.stage ?? null;
  const groups: [string, string[], string, string][] = [
    ["Needs", insight?.needs ?? [], "var(--c-intelligence-bg)", "var(--c-intelligence)"],
    ["Motivations", insight?.motivations ?? [], "var(--success-bg)", "var(--success)"],
    ["Objections", (insight?.objections ?? fallback?.objections ?? []).map((o) => humanize(o.toUpperCase())), "var(--danger-bg)", "var(--danger)"],
  ];
  return (
    <section className={cn("rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card", className)} aria-label="Customer insight">
      <div className="flex items-center gap-2.5">
        <Tile icon={Brain} size={34} radius={11} color="var(--c-intelligence)" bg="var(--c-intelligence-bg)" iconSize={16} />
        <span className="leading-[1.2]">
          <Eyebrow as="span" className="block">
            Intelligence agent
          </Eyebrow>
          <span className="block text-sm font-extrabold">Customer insight · estimate</span>
        </span>
      </div>
      {intent === null ? (
        <p className="mt-4 text-[13px] text-t3">The intelligence agent has not analysed this conversation yet.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3.5">
            <span
              role="meter"
              aria-label="Purchase intent"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={intent}
              className="relative grid size-16 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--c-intelligence) ${Math.round(Math.max(0, Math.min(1, intent)) * 360)}deg, var(--panel3) 0)` }}
            >
              <span className="tabular grid size-[50px] place-items-center rounded-full bg-panel text-[15px] font-extrabold">{intent.toFixed(2)}</span>
            </span>
            <span className="leading-[1.3]">
              <span className="block text-[13px] font-extrabold">Purchase intent</span>
              <span className="block text-xs text-t3">
                {stage ? `${humanize(stage.toUpperCase())} stage` : "Stage unknown"} · {sentimentWord(insight?.sentiment_label)} sentiment
              </span>
            </span>
          </div>
          {groups.map(([title, items, bg, fg]) => (
            <div key={title}>
              <Eyebrow className="mt-3.5">{title}</Eyebrow>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {items.length ? (
                  items.map((i) => (
                    <span key={i} className="rounded-[9px] px-2.5 py-[5px] text-[12.5px] font-bold" style={{ background: bg, color: fg }}>
                      {i}
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] text-t4">none</span>
                )}
              </div>
            </div>
          ))}
          <p className="mt-3.5 rounded-xl bg-panel2 px-3 py-2.5 text-[12.5px] leading-[1.5] text-t2">
            <span className="font-extrabold text-text">Suggested follow-up. </span>
            {insight?.recommended_follow_up ?? "None yet."}
          </p>
        </>
      )}
      {note && <p className="mt-3 text-xs text-t4">{note}</p>}
      {workflowHref && (
        <Link href={workflowHref} className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold">
          Open workflow <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

/** Prototype "Screened." card under the inspector. */
export function ScreenedCard({ flagged = 0 }: { flagged?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-hair bg-panel px-5 py-4 shadow-card">
      <Tile icon={ShieldCheck} size={34} radius={11} color="var(--c-security)" bg="var(--c-security-bg)" iconSize={16} />
      <span className="text-[13px] leading-[1.4] text-t2">
        <span className="font-extrabold text-text">{flagged ? `${flagged} message${flagged === 1 ? "" : "s"} refused.` : "Screened."}</span>{" "}
        {flagged ? "Injection patterns were blocked before any model call and logged as security events." : "Every message passed the injection classifier before any model saw it."}
      </span>
    </div>
  );
}

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

/** Right column of the Studio: live intelligence + workflow state + agent participation + hand-offs for one conversation. */
export function StudioInspector({ conversationId }: { conversationId: string | null }) {
  if (!conversationId)
    return (
      <div className="flex flex-col gap-3.5">
        <IntelligenceInspector insight={null} note="Start or select a conversation. The workflow, agent activity and customer insight appear here live." />
        <ScreenedCard />
      </div>
    );
  return <Inspector key={conversationId} conversationId={conversationId} />;
}

function Inspector({ conversationId }: { conversationId: string }) {
  const { conv, workflowId, loading, convUnavailable } = useConversationWorkflow(conversationId);
  const wf = useQuery({ queryKey: [...qk.workflows, workflowId], queryFn: () => api.get<WorkflowDetail>(`/workflows/${workflowId}`), enabled: !!workflowId });
  const history = useQuery({ queryKey: [...qk.workflows, workflowId, "events"], queryFn: () => api.get<AppEvent[]>(`/workflows/${workflowId}/events`), enabled: !!workflowId });
  const { events: live, status } = useEvents();

  const txId = wf.data?.transaction_id;
  const events = useMemo(() => {
    const mine = live.filter((e) => (workflowId && e.workflow_id === workflowId) || (txId && (e.data as { transaction_id?: string })?.transaction_id === txId));
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

  if (loading)
    return (
      <div className="flex flex-col gap-3.5" aria-busy>
        <Skeleton className="h-80 rounded-[22px]" />
        <Skeleton className="h-16 rounded-[22px]" />
        <Skeleton className="h-48 rounded-[22px]" />
      </div>
    );

  const w = wf.data;
  const ctx = (w?.context ?? {}) as { purchase_intent?: number; objections?: string[]; last_intent?: string };
  const participated = new Set(events.map((e) => e.agent_id).filter(Boolean));
  const flagged = (conv.data as { flagged_count?: number } | undefined)?.flagged_count ?? 0;

  return (
    <div className="flex flex-col gap-3.5">
      <IntelligenceInspector
        insight={conv.data?.insight ?? null}
        fallback={{ purchase_intent: ctx.purchase_intent, objections: ctx.objections, stage: ctx.last_intent }}
        workflowHref={workflowId ? `/workflows/${workflowId}` : undefined}
        note={!conv.data?.insight && convUnavailable ? "Full insight needs GET /conversations/{id}; showing the workflow's summary signals." : undefined}
      />
      <ScreenedCard flagged={flagged} />

      <section className="rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card" aria-label="Workflow">
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>Workflow</Eyebrow>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-t3">
            <span aria-hidden className={cn("size-2 rounded-full", status === "live" ? "anim-live-pip bg-[#3DCB8B]" : status === "polling" ? "bg-warning" : "bg-t4")} />
            {status === "live" ? "Live" : status === "polling" ? "Polling" : "Offline"}
          </span>
        </div>
        {!workflowId ? (
          <p className="mt-2.5 text-[13px] text-t3">Looking for this conversation&apos;s workflow. The orchestrator opens one per conversation.</p>
        ) : w ? (
          <>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={w.state} size="lg" />
              <span className="text-[12.5px] text-t3">{w.label}</span>
            </div>
            <ol className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px] text-t3" aria-label="State history">
              {w.steps.slice(-6).map((s, i) => (
                <li key={s.id} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight aria-hidden className="size-3 text-t4" />}
                  <span title={s.note ?? undefined}>{humanize(s.to_state)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <Skeleton className="mt-2.5 h-7 w-48" />
        )}
        <Eyebrow className="mt-4">Agents on this conversation</Eyebrow>
        <ul className="mt-2 grid grid-cols-3 gap-1.5">
          {SIX.map((id) => {
            const on = participated.has(id);
            return (
              <li key={id} className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center", on ? "border-hair bg-panel2" : "border-dashed border-hair2 opacity-60")}>
                <AgentAvatar agentId={id} size={28} />
                <span className="text-[11.5px] font-bold">{AGENT_META[id].name}</span>
                <span className={cn("text-[10.5px]", on ? "text-success" : "text-t4")}>{on ? DOING[id] : "waiting"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card" aria-label="Agent activity">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Activity</Eyebrow>
          <span className="num text-xs text-t3">{events.length} events</span>
        </div>
        <ol className="mt-2 grid max-h-72 gap-0 overflow-y-auto pr-1" aria-live="polite">
          {events.slice(0, 40).map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 border-t border-hair py-2 first:border-0">
              {e.agent_id ? <AgentAvatar agentId={e.agent_id} size={24} /> : <Tile icon={WorkflowIcon} size={24} radius={8} color="var(--c-orchestrator)" bg="var(--c-orchestrator-bg)" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] leading-[1.4] [overflow-wrap:anywhere]">{e.summary}</span>
                <span className="num block text-[10.5px] text-t3">
                  {e.type} · <TimeAgo date={e.created_at} />
                </span>
              </span>
            </li>
          ))}
          {!events.length && <li className="text-[13px] text-t3">No activity yet.</li>}
        </ol>
      </section>

      <section className="rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card" aria-label="Agent-to-agent messages">
        <div className="flex items-baseline justify-between">
          <Eyebrow>Hand-offs</Eyebrow>
          <span className="num text-xs text-t3">{w?.messages.length ?? 0}</span>
        </div>
        {w?.messages.length ? (
          <ol className="mt-2 grid max-h-64 gap-2 overflow-y-auto pr-1">
            {[...w.messages].reverse().slice(0, 30).map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-[12.5px]">
                <AgentAvatar agentId={m.from_agent} size={24} />
                <ArrowRight aria-hidden className="size-3 text-t4" />
                <AgentAvatar agentId={m.to_agent} size={24} />
                <span className="num min-w-0 flex-1 truncate text-[10.5px] text-t3">{m.message_type}</span>
                <TimeAgo date={m.created_at} className="num text-[10.5px] text-t3" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[13px] text-t3">{w ? "No hand-offs yet." : "Loading"}</p>
        )}
      </section>
    </div>
  );
}

