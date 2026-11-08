"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Hand, RotateCcw, User, UserCheck } from "lucide-react";
import { AgentAvatar, AGENT_META, DataTable, Money, RiskBar, StatusBadge, TimeAgo, Tile, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Approval, Paged } from "@/lib/types";
import { Chip, Page } from "@/features/security/shared";
import { Countdown } from "./countdown";

export const OPEN = new Set(["PENDING_REVIEW", "INFO_REQUESTED", "INFORMATION_REQUESTED"]);
export const isRefund = (a: Approval) => /refund/i.test(a.action);

export function useApprovals() {
  return useQuery({
    queryKey: [...qk.approvals, "list"],
    // ponytail: one fetch of the latest 200 covers queue + history; add server paging per tab if volume grows.
    queryFn: () => api.get<Paged<Approval>>("/approvals", { query: { page_size: 200 } }),
  });
}

/** Requested-by cell: agent tile + "Payment agent", or user icon + email. */
export function Requester({ a }: { a: Approval }) {
  if (a.requested_by_agent)
    return (
      <span className="inline-flex items-center gap-2.5">
        <AgentAvatar agentId={a.requested_by_agent} size={32} />
        <span className="text-sm font-bold whitespace-nowrap">{AGENT_META[a.requested_by_agent]?.name ?? a.requested_by_agent} agent</span>
      </span>
    );
  if (a.requested_by_user)
    return (
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <Tile icon={User} size={32} radius={10} color="var(--c-human)" bg="var(--c-human-bg)" />
        <span className="num truncate text-xs">{a.requested_by_user}</span>
      </span>
    );
  return <span className="text-t3">system</span>;
}

export function ApprovalsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "history" ? "history" : "queue";
  const q = useApprovals();

  const { queue, history } = useMemo(() => {
    const items = q.data?.items ?? [];
    return {
      queue: items.filter((a) => OPEN.has(a.status)).sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0) || a.created_at.localeCompare(b.created_at)),
      history: items.filter((a) => !OPEN.has(a.status)),
    };
  }, [q.data]);
  const rows = tab === "queue" ? queue : history;

  const columns: Column<Approval>[] = [
    {
      key: "action",
      header: "Requested action",
      cell: (a) => (
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <Tile icon={isRefund(a) ? RotateCcw : Hand} size={32} radius={10} color="var(--c-sales)" bg="var(--c-sales-bg)" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{humanize(a.action)}</span>
            <span className="num block text-[11.5px] text-t3">{a.transaction?.reference ?? a.id.slice(0, 8)}</span>
          </span>
        </span>
      ),
    },
    { key: "by", header: "Requested by", cell: (a) => <Requester a={a} /> },
    { key: "customer", header: "Customer", cell: (a) => <span className="text-sm">{a.customer?.full_name ?? "-"}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (a) => (a.transaction ? <Money value={a.transaction.amount} className="text-[13px]" /> : "-") },
    { key: "risk", header: "Risk", cell: (a) => (a.risk_score == null ? "-" : <RiskBar score={Math.round(a.risk_score * 100)} width={48} />) },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} size="lg" /> },
    tab === "queue"
      ? { key: "exp", header: "Expires", align: "right", cell: (a) => <Countdown to={a.expires_at} /> }
      : {
          key: "decided",
          header: "Decided",
          align: "right",
          cell: (a) => {
            const d = a.decisions.at(-1);
            return d ? <span className="num text-xs text-t3">{d.decided_by_email}</span> : <span className="text-t3">—</span>;
          },
        },
    { key: "created", header: "Requested", align: "right", cell: (a) => <TimeAgo date={a.created_at} className="text-[12.5px] text-t3" /> },
  ];

  return (
    <Page
      title="Approvals"
      description="Agents can request, only humans decide. The requester never approves their own request, and every decision is server-enforced and audited."
    >
      <div className="flex items-center gap-3.5 rounded-[22px] border border-hair bg-panel px-5 py-4 shadow-card">
        <Tile icon={UserCheck} size={40} radius={13} color="var(--c-human)" bg="var(--c-human-bg)" iconSize={19} />
        <p className="text-[13.5px] leading-[1.5] text-t2">
          <span className="font-extrabold text-text">Agents can request, only humans decide. </span>
          The requester cannot approve their own request (four-eyes rule). Every decision is enforced by the server and written to the audit log.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Pending" count={q.data ? queue.length : undefined} selected={tab === "queue"} onClick={() => router.replace("/approvals", { scroll: false })} />
        <Chip label="History" count={q.data ? history.length : undefined} selected={tab === "history"} onClick={() => router.replace("/approvals?tab=history", { scroll: false })} />
      </div>

      <div>
        <DataTable
          columns={columns}
          rows={q.data ? rows : undefined}
          rowKey={(a) => a.id}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          onRowClick={(a) => router.push(`/approvals/${a.id}`)}
          emptyTitle={tab === "queue" ? "Nothing waiting for a decision" : "No decisions yet"}
          emptyDescription={tab === "queue" ? "Held payments and refund requests will appear here." : "Approved, rejected and expired requests appear here."}
          minWidth={900}
        />
        {q.data && rows.length > 0 && (
          <p className="num mt-2.5 px-1 text-xs text-t3">{tab === "queue" ? "Highest risk first · requests expire after 60 minutes" : `${history.length} decisions`}</p>
        )}
      </div>
    </Page>
  );
}
