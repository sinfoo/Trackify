"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Hand, X } from "lucide-react";
import { toast } from "sonner";
import { agentColors, agentMeta, BackLink, ErrorState, Eyebrow, Money, StatusBadge, Tile, TimeAgo, humanize } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { AgentMessage, WorkflowDetail as WorkflowDetailT } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExecutionTable } from "@/features/agents/execution-list";
import { JsonBlock } from "@/features/agents/json-block";
import { JourneyGraph } from "./journey-graph";

const FINISHED = new Set(["COMPLETED", "CANCELLED", "BLOCKED"]);
const CARD = "rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card";
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function compact(payload: Record<string, unknown>) {
  return Object.entries(payload ?? {})
    .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 14 && /^[0-9a-f-]{36}$/.test(v) ? v.slice(0, 8) : JSON.stringify(v)}`)
    .join("  ");
}

const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : "—");

function Fact({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="border-t border-hair py-[9px] text-[13px] text-t3">{k}</dt>
      <dd className={cn("border-t border-hair py-[9px] text-right text-[13.5px] font-semibold [overflow-wrap:anywhere]", mono ? "num" : "tabular")}>{v}</dd>
    </>
  );
}

/** Prototype detail section: eyebrow + mono count, rows 11px 0 with hairline tops. */
function Section({ title, count, children, className }: { title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn(CARD, "min-w-0", className)}>
      <div className="flex items-baseline justify-between">
        <Eyebrow>{title}</Eyebrow>
        {count !== undefined && <span className="num text-xs text-t3">{count}</span>}
      </div>
      <div className="mt-2">{children}</div>
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
  if (q.isPending)
    return (
      <>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-28 w-full rounded-[22px]" />
        <Skeleton className="h-[420px] w-full rounded-[22px]" />
      </>
    );
  const w = q.data;
  const agentsInvolved = new Set([...w.executions.map((x) => x.agent_id), ...w.steps.flatMap((s) => (s.agent_id ? [s.agent_id] : []))]);

  return (
    <>
      <BackLink href="/workflows">All workflows</BackLink>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_520px] items-center gap-4">
          <Tile icon={GitBranch} size={56} radius={18} iconSize={26} {...agentColors("orchestrator")} />
          <div className="min-w-0">
            <Eyebrow>Workflow · {humanize(w.kind.toUpperCase())}</Eyebrow>
            <h1 className="headline mt-0.5 text-[26px] leading-[1.15]">{w.label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[13px] text-t3">
              <StatusBadge status={w.state} size="lg" />
              <span className="num">{w.id}</span>
              <span>{w.customer_name ?? "No customer"}</span>
              <span>
                Started <TimeAgo date={w.created_at} /> · updated <TimeAgo date={w.updated_at} />
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {w.state === "AWAITING_APPROVAL" && (
            <Button asChild className="h-10 rounded-xl px-4">
              <Link href="/approvals" className="no-underline hover:no-underline">
                <Hand aria-hidden /> Open approval
              </Link>
            </Button>
          )}
          {can(me, "workflows:write") && !FINISHED.has(w.state) && <CancelControl id={id} />}
        </div>
      </div>

      {w.error && (
        <p role="alert" className="flex items-start gap-3 rounded-[18px] border border-danger bg-danger-bg px-4 py-3.5 text-[13.5px] leading-[1.5] text-danger">
          <X aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.2} />
          <span>
            <span className="font-extrabold">Error. </span>
            {w.error}
          </span>
        </p>
      )}

      <JourneyGraph steps={w.steps} current={w.state} />

      <div className="grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        <section aria-label="Context" className={CARD}>
          <Eyebrow>Context</Eyebrow>
          <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-[18px]">
            <Fact k="Customer" v={w.customer_name ?? "None"} />
            <Fact k="Kind" v={humanize(w.kind.toUpperCase())} />
            <Fact k="Transaction" v={short(w.transaction_id)} mono />
            <Fact k="Conversation" v={short(w.conversation_id)} mono />
            <Fact k="Agents involved" v={`${agentsInvolved.size} of 6`} />
            <Fact k="Executions" v={w.executions.length} mono />
            <Fact k="Messages" v={w.messages.length} mono />
            <Fact k="Approvals" v={w.approvals.length} mono />
          </dl>
        </section>

        <Section title="Timeline" count={w.steps.length}>
          {w.steps.length === 0 ? (
            <p className="py-3 text-[13px] text-t3">No transitions yet.</p>
          ) : (
            <ol>
              {w.steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3 border-t border-hair py-[11px]">
                  <span className="num w-5 shrink-0 pt-2 text-right text-[11px] text-t4">{i + 1}</span>
                  {s.agent_id ? (
                    <Tile icon={agentMeta(s.agent_id).icon} size={32} radius={10} iconSize={15} {...agentColors(s.agent_id)} />
                  ) : (
                    <Tile icon={GitBranch} size={32} radius={10} iconSize={15} {...agentColors("orchestrator")} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {s.from_state && (
                        <>
                          <StatusBadge status={s.from_state} size="sm" iconless className="font-extrabold" />
                          <ArrowRight aria-label="to" className="size-3 text-t4" />
                        </>
                      )}
                      <StatusBadge status={s.to_state} size="sm" className="font-extrabold" />
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-[1.45] text-t3 [overflow-wrap:anywhere]">
                      {s.agent_id && <span className="font-bold text-text">{agentMeta(s.agent_id).name}</span>}
                      {s.agent_id && s.note ? ": " : ""}
                      {s.note}
                    </span>
                  </span>
                  <time className="num shrink-0 text-[11px] whitespace-nowrap text-t3" dateTime={s.created_at} title={formatDateTime(s.created_at)}>
                    {clock.format(new Date(s.created_at))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Agent messages" count={w.messages.length}>
          {w.messages.length === 0 ? <p className="py-3 text-[13px] text-t3">No agent-to-agent messages yet.</p> : <MessageThread messages={w.messages} />}
        </Section>
      </div>

      <section aria-label="Agent executions" className={cn(CARD, "overflow-hidden px-0 pb-0")}>
        <div className="flex items-baseline justify-between px-5 pb-3">
          <Eyebrow>Agent executions</Eyebrow>
          <span className="num text-xs text-t3">{w.executions.length}</span>
        </div>
        <ExecutionTable items={w.executions} showAgent showWorkflow={false} bare />
      </section>

      {w.approvals.length > 0 && (
        <Section title="Approvals" count={w.approvals.length}>
          <ul>
            {w.approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 border-t border-hair py-[11px]">
                <Tile icon={Hand} size={32} radius={10} iconSize={15} tone="warning" />
                <StatusBadge status={a.status} />
                <span className="num text-[13px] font-semibold">{a.action}</span>
                <span className="min-w-0 flex-1 text-[12.5px] text-t3">{a.reason}</span>
                {a.transaction && <Money value={a.transaction.amount} className="text-[13px]" />}
                <Link href="/approvals" className="text-[12.5px] font-bold whitespace-nowrap">
                  Approvals →
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <JsonBlock value={w.context} label="Workflow context" />
    </>
  );
}

function MessageThread({ messages }: { messages: AgentMessage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="max-h-[560px] overflow-y-auto">
      {messages.map((m) => {
        const from = agentMeta(m.from_agent);
        const to = agentMeta(m.to_agent);
        const expanded = open === m.id;
        return (
          <li key={m.id} className="border-t border-hair">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : m.id)}
              className="flex w-full items-start gap-3 py-[11px] text-left"
            >
              <span className="inline-flex shrink-0 items-center gap-1.5 pt-0.5">
                <Tile icon={from.icon} size={26} radius={8} iconSize={13} {...agentColors(m.from_agent)} />
                <ArrowRight aria-label="to" className="size-[13px] text-t4" />
                <Tile icon={to.icon} size={26} radius={8} iconSize={13} {...agentColors(m.to_agent)} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-bold">
                    {from.name} → {to.name}
                  </span>
                  <span className="num rounded-full bg-panel3 px-2 py-0.5 text-[10.5px] font-semibold text-t2">{m.message_type}</span>
                </span>
                <span className={cn("num mt-[3px] block text-xs text-t3", !expanded && "truncate")}>{compact(m.payload) || "no payload"}</span>
              </span>
              <time className="num shrink-0 text-[11px] whitespace-nowrap text-t3" dateTime={m.created_at} title={formatDateTime(m.created_at)}>
                {clock.format(new Date(m.created_at))}
              </time>
            </button>
            {expanded && (
              <pre className="num anim-fade-in mb-3 max-h-72 overflow-auto rounded-xl border border-hair bg-panel2 px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(m.payload, null, 2)}
              </pre>
            )}
          </li>
        );
      })}
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
      <Button variant="destructive" className="h-10 rounded-xl px-4" onClick={() => setConfirming(true)}>
        <X aria-hidden /> Cancel workflow
      </Button>
    );
  return (
    <div role="group" aria-label="Confirm cancel" className="flex h-10 flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-bg px-3">
      <span className="text-[13px] font-semibold text-danger">Stop this journey for good?</span>
      <Button variant="destructive" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending} autoFocus>
        {cancel.isPending ? "Cancelling" : "Yes, cancel"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
    </div>
  );
}
