"use client";

import { useState } from "react";
import Link from "next/link";
import { AgentAvatar, agentMeta, DataTable, Eyebrow, Pill, StatusBadge, type Column } from "@/components/ui-kit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { Execution } from "@/lib/types";

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ms = (v: number | null | undefined) => (v == null ? "—" : `${formatNumber(v)} ms`);

/**
 * Prototype executions table (started · trigger · status · duration · tokens · provider) with a JSON inspector drawer.
 * Used by Agent detail (paginated) and Workflow detail (embedded, with the agent column).
 */
export function ExecutionTable({
  items,
  loading,
  error,
  onRetry,
  showAgent = false,
  showWorkflow = true,
  page,
  pageSize,
  total,
  onPageChange,
  bare,
}: {
  items: Execution[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  showAgent?: boolean;
  showWorkflow?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  bare?: boolean;
}) {
  const [open, setOpen] = useState<Execution | null>(null);

  const columns: Column<Execution>[] = [
    {
      key: "started",
      header: "Started",
      cell: (x) => (
        <time dateTime={x.started_at} title={formatDateTime(x.started_at)} className="num text-[12.5px] text-t3" suppressHydrationWarning>
          {clock.format(new Date(x.started_at))}
        </time>
      ),
    },
    ...(showAgent
      ? [
          {
            key: "agent",
            header: "Agent",
            cell: (x: Execution) => (
              <span className="inline-flex items-center gap-2">
                <AgentAvatar agentId={x.agent_id} size={28} />
                <span className="text-[13.5px] font-bold">{agentMeta(x.agent_id).name}</span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: "trigger",
      header: "Trigger",
      cell: (x) => (
        <span className="block min-w-0 leading-[1.2]">
          <span className="num block truncate text-[13px] font-semibold">{x.task_type}</span>
          <span className="mt-px block truncate text-xs text-t3">{x.triggered_by}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (x) => <StatusBadge status={x.status} /> },
    { key: "duration", header: "Duration", align: "right", cell: (x) => <span className="num text-[13px]">{ms(x.duration_ms)}</span> },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      cell: (x) => (
        <span className="num text-[13px] text-t2">
          {x.tokens_in == null && x.tokens_out == null ? "—" : `${formatNumber(x.tokens_in ?? 0)} / ${formatNumber(x.tokens_out ?? 0)}`}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (x) => (x.provider ? <Pill mono size="sm" className="text-t2">{x.provider}</Pill> : <span className="text-t4">—</span>),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(x) => x.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyTitle="No executions yet"
        emptyDescription="Runs appear here as soon as the agent is dispatched."
        onRowClick={setOpen}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        minWidth={showAgent ? 860 : 760}
        bare={bare}
      />
      <ExecutionInspector x={open} onClose={() => setOpen(null)} showWorkflow={showWorkflow} />
    </>
  );
}

function Fact({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="border-t border-hair py-[9px] text-[13px] text-t3">{k}</dt>
      <dd className={`border-t border-hair py-[9px] text-right text-[13.5px] font-semibold [overflow-wrap:anywhere] ${mono ? "num" : "tabular"}`}>{v}</dd>
    </>
  );
}

/** Right-hand drawer with every field of one execution and its raw output JSON. */
function ExecutionInspector({ x, onClose, showWorkflow }: { x: Execution | null; onClose: () => void; showWorkflow: boolean }) {
  return (
    <Sheet open={x !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        {x && (
          <>
            <SheetHeader className="border-b border-hair px-6 py-5">
              <div className="flex items-center gap-3">
                <AgentAvatar agentId={x.agent_id} size={44} />
                <div className="min-w-0">
                  <Eyebrow>Execution · {agentMeta(x.agent_id).full}</Eyebrow>
                  <SheetTitle className="num mt-0.5 truncate text-[18px] font-extrabold tracking-[-0.01em]">{x.task_type}</SheetTitle>
                </div>
              </div>
              <SheetDescription className="mt-2 flex flex-wrap items-center gap-2.5 text-[13px] text-t3">
                <StatusBadge status={x.status} size="lg" />
                <span className="num">{x.id.slice(0, 8)}</span>
                <span>{formatDateTime(x.started_at)}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-6 py-5">
              <section>
                <Eyebrow>Details</Eyebrow>
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-[18px]">
                  <Fact k="Triggered by" v={x.triggered_by} mono />
                  <Fact k="Provider" v={x.provider ?? "rules engine"} />
                  <Fact k="Duration" v={ms(x.duration_ms)} mono />
                  <Fact k="Tokens in / out" v={`${formatNumber(x.tokens_in ?? 0)} / ${formatNumber(x.tokens_out ?? 0)}`} mono />
                  <Fact k="Attempts" v={x.attempts} mono />
                  <Fact k="Completed" v={x.completed_at ? formatDateTime(x.completed_at) : "—"} />
                  {showWorkflow && (
                    <Fact
                      k="Workflow"
                      v={
                        x.workflow_id ? (
                          <Link href={`/workflows/${x.workflow_id}`} className="num text-brand-text">
                            {x.workflow_id.slice(0, 8)}
                          </Link>
                        ) : (
                          "Manual / system"
                        )
                      }
                    />
                  )}
                </dl>
              </section>
              {(x.input_summary || x.output_summary) && (
                <section className="flex flex-col gap-3">
                  {x.input_summary && (
                    <div>
                      <Eyebrow>Input</Eyebrow>
                      <p className="mt-1.5 text-[13.5px] leading-[1.5] text-t2">{x.input_summary}</p>
                    </div>
                  )}
                  {x.output_summary && (
                    <div>
                      <Eyebrow>Output</Eyebrow>
                      <p className="mt-1.5 text-[13.5px] leading-[1.5]">{x.output_summary}</p>
                    </div>
                  )}
                </section>
              )}
              {x.error && (
                <p role="alert" className="rounded-[14px] border border-danger/40 bg-danger-bg px-4 py-3 text-[13.5px] leading-[1.5] text-danger">
                  <span className="font-extrabold">Error. </span>
                  {x.error}
                </p>
              )}
              <section>
                <div className="flex items-baseline justify-between">
                  <Eyebrow>Output JSON</Eyebrow>
                  <span className="num text-xs text-t3">{x.output == null ? "empty" : `${JSON.stringify(x.output).length} chars`}</span>
                </div>
                <pre className="num mt-2 max-h-[46vh] overflow-auto rounded-xl border border-hair bg-panel2 px-3.5 py-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {x.output == null ? "null" : JSON.stringify(x.output, null, 2)}
                </pre>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
