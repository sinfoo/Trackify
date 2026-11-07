"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AgentAvatar, AGENT_META, EmptyState, ErrorState, Money, PageHeader, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { AgentMessage, WorkflowDetail as WorkflowDetailT } from "@/lib/types";
import { ExecutionList } from "@/features/agents/execution-list";
import { JsonBlock } from "@/features/agents/json-block";
import { JourneyGraph } from "./journey-graph";

const FINISHED = new Set(["COMPLETED", "CANCELLED", "BLOCKED"]);

function compact(payload: Record<string, unknown>) {
  return Object.entries(payload ?? {})
    .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 14 && /^[0-9a-f-]{36}$/.test(v) ? v.slice(0, 8) : JSON.stringify(v)}`)
    .join("  ");
}

function Who({ id }: { id: string }) {
  if (id === "human")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <UserCheck aria-hidden className="size-4" /> Human
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <AgentAvatar agentId={id} size="sm" />
      <span className="text-sm font-medium">{AGENT_META[id]?.name ?? id}</span>
    </span>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="mb-3 text-lg font-semibold">
        {title} {count !== undefined && <span className="num text-base font-normal text-muted-foreground">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

export function WorkflowDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const key = [...qk.workflows, "detail", id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<WorkflowDetailT>(`/workflows/${id}`) });

  // workflow.* events already refresh qk.workflows; agent.* / payment.* for this workflow need a nudge too.
  const { events } = useEvents();
  const seen = useRef(0);
  useEffect(() => {
    const mine = events.filter((e) => e.workflow_id === id && e.id > seen.current);
    if (!mine.length) return;
    seen.current = Math.max(...mine.map((e) => e.id));
    qc.invalidateQueries({ queryKey: [...qk.workflows, "detail", id] });
  }, [events, id, qc]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-[600px] w-full" />;
  const w = q.data;

  return (
    <>
      <Link href="/workflows" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> All workflows
      </Link>
      <PageHeader
        title={w.label}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={w.state} />
            <span>{w.customer_name ?? "No customer"}</span>
            <span className="num text-sm">{w.id}</span>
            <span className="text-sm">
              Started <TimeAgo date={w.created_at} />, updated <TimeAgo date={w.updated_at} />
            </span>
          </span>
        }
        actions={can(me, "workflows:write") && !FINISHED.has(w.state) ? <CancelControl id={id} /> : undefined}
      />
      {w.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-danger-text">
          {w.error}
        </p>
      )}

      <section aria-label="Journey" className="mb-6">
        <JourneyGraph steps={w.steps} current={w.state} />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm bg-primary" /> Current state
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border border-info/40 bg-info/10" /> Visited
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border border-danger/50 bg-danger/12" /> Failed or blocked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border border-dashed" /> Not reached
          </span>
        </p>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Timeline" count={w.steps.length}>
          {w.steps.length === 0 ? (
            <EmptyState title="No transitions yet" />
          ) : (
            <ol className="space-y-0 rounded-xl border bg-card">
              {w.steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 border-b px-4 py-3 last:border-b-0">
                  <span className="num w-6 shrink-0 pt-0.5 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.from_state && <StatusBadge status={s.from_state} />}
                      {s.from_state && <ArrowRight aria-label="to" className="size-3.5 text-muted-foreground" />}
                      <StatusBadge status={s.to_state} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.agent_id && <span className="font-medium text-foreground">{AGENT_META[s.agent_id]?.name ?? s.agent_id}</span>}
                      {s.agent_id && s.note ? ": " : ""}
                      {s.note}
                    </p>
                  </div>
                  <time className="num shrink-0 text-xs text-muted-foreground" dateTime={s.created_at} title={formatDateTime(s.created_at)}>
                    {new Date(s.created_at).toLocaleTimeString("en-GB")}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Agent messages" count={w.messages.length}>
          {w.messages.length === 0 ? <EmptyState title="No agent-to-agent messages" /> : <MessageThread messages={w.messages} />}
        </Panel>
      </div>

      <div className="mb-6">
        <Panel title="Agent executions" count={w.executions.length}>
          <ExecutionList items={w.executions} showAgent showWorkflow={false} />
        </Panel>
      </div>

      {w.approvals.length > 0 && (
        <div className="mb-6">
          <Panel title="Approvals" count={w.approvals.length}>
            <ul className="divide-y rounded-xl border bg-card">
              {w.approvals.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <StatusBadge status={a.status} />
                  <span className="num text-sm font-medium">{a.action}</span>
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">{a.reason}</span>
                  {a.transaction && <Money value={a.transaction.amount} className="text-sm" />}
                  <Link href="/approvals" className="text-sm text-info-text underline-offset-4 hover:underline">
                    Approval Center
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <JsonBlock value={w.context} label="Workflow context" />
    </>
  );
}

function MessageThread({ messages }: { messages: AgentMessage[] }) {
  return (
    <ol className="max-h-[560px] overflow-y-auto rounded-xl border bg-card">
      {messages.map((m) => (
        <li key={m.id} className="space-y-1 border-b px-4 py-3 last:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <Who id={m.from_agent} />
            <ArrowRight aria-label="to" className="size-4 text-muted-foreground" />
            <Who id={m.to_agent} />
            <span className="num ml-auto rounded-md border bg-muted px-1.5 py-0.5 text-xs">{m.message_type}</span>
          </div>
          <p className="num truncate text-xs text-muted-foreground" title={JSON.stringify(m.payload)}>
            {compact(m.payload) || "no payload"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function CancelControl({ id }: { id: string }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/cancel`),
    onSuccess: () => {
      toast.success("Workflow cancelled");
      setConfirming(false);
      qc.invalidateQueries({ queryKey: qk.workflows });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not cancel"),
  });
  if (!confirming)
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Cancel workflow
      </Button>
    );
  return (
    <div role="group" aria-label="Confirm cancel" className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5">
      <span className="text-sm">Stop this journey for good?</span>
      <Button variant="destructive" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending} autoFocus>
        {cancel.isPending ? "Cancelling" : "Yes, cancel"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
    </div>
  );
}
