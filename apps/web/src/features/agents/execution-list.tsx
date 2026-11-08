"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AgentAvatar, EmptyState, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { formatNumber } from "@/lib/format";
import type { Execution } from "@/lib/types";
import { JsonBlock } from "./json-block";

/** Execution rows with a native expandable detail. Used on agent detail and workflow detail. */
export function ExecutionList({ items, showAgent = false, showWorkflow = true }: { items: Execution[]; showAgent?: boolean; showWorkflow?: boolean }) {
  if (!items.length) return <EmptyState title="No executions yet" description="Runs appear here as soon as the agent is dispatched." />;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((x) => (
        <li key={x.id}>
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
              {showAgent && <AgentAvatar agentId={x.agent_id} size="sm" />}
              <StatusBadge status={x.status} />
              <span className="num text-sm font-medium">{x.task_type}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{x.output_summary ?? x.error ?? ""}</span>
              {x.provider && (
                <span className="num rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground" title="AI provider that served this run">
                  {x.provider}
                </span>
              )}
              <span className="num text-xs text-muted-foreground">{x.duration_ms != null ? `${formatNumber(x.duration_ms)} ms` : "-"}</span>
              <TimeAgo date={x.started_at} className="text-xs text-muted-foreground" />
              <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t bg-muted/20 px-4 py-3 text-sm">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Input">{x.input_summary ?? "-"}</Field>
                <Field label="Output">{x.output_summary ?? "-"}</Field>
                <Field label="Triggered by" mono>{x.triggered_by}</Field>
                <Field label="Provider" mono>{x.provider ?? "-"}</Field>
                <Field label="Tokens in / out" mono>
                  {formatNumber(x.tokens_in ?? 0)} / {formatNumber(x.tokens_out ?? 0)}
                </Field>
                <Field label="Attempts" mono>{x.attempts}</Field>
                <Field label="Duration" mono>{x.duration_ms != null ? `${formatNumber(x.duration_ms)} ms` : "-"}</Field>
                {showWorkflow && (
                  <Field label="Workflow">
                    {x.workflow_id ? (
                      <Link href={`/workflows/${x.workflow_id}`} className="num text-info-text underline-offset-4 hover:underline">
                        {x.workflow_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "Manual / system"
                    )}
                  </Field>
                )}
              </dl>
              {x.error && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-danger-text">
                  {x.error}
                </p>
              )}
              <JsonBlock value={x.output} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "num break-words" : "break-words"}>{children}</dd>
    </div>
  );
}
