"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, UserCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, Money, PageHeader, StatusBadge, TimeAgo, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Approval, Paged } from "@/lib/types";
import { Actor, Notice, RiskScore } from "@/features/security/shared";
import { Countdown } from "./countdown";

const OPEN = new Set(["PENDING_REVIEW", "INFO_REQUESTED", "INFORMATION_REQUESTED"]);

export function useApprovals() {
  return useQuery({
    queryKey: [...qk.approvals, "list"],
    // ponytail: one fetch of the latest 200 covers queue + history; add server paging per tab if volume grows.
    queryFn: () => api.get<Paged<Approval>>("/approvals", { query: { page_size: 200 } }),
  });
}

export function requester(a: Approval) {
  return a.requested_by_user ? (
    <Actor type="user" id={a.requested_by_user} />
  ) : a.requested_by_agent ? (
    <Actor type="agent" id={a.requested_by_agent} />
  ) : (
    <span className="text-muted-foreground">system</span>
  );
}

export function ApprovalsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "history" ? "history" : "queue";
  const q = useApprovals();

  const { queue, history } = useMemo(() => {
    const items = q.data?.items ?? [];
    return {
      queue: items
        .filter((a) => OPEN.has(a.status))
        .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0) || a.created_at.localeCompare(b.created_at)),
      history: items.filter((a) => !OPEN.has(a.status)),
    };
  }, [q.data]);

  const columns: Column<Approval>[] = [
    {
      key: "action",
      header: "Requested action",
      cell: (a) => (
        <Link href={`/approvals/${a.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          {humanize(a.action)}
        </Link>
      ),
    },
    { key: "by", header: "Requested by", cell: requester },
    { key: "customer", header: "Customer", cell: (a) => a.customer?.full_name ?? "-", className: "hidden md:table-cell" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (a) => (a.transaction ? <Money value={a.transaction.amount} /> : "-"),
    },
    { key: "risk", header: "Risk", cell: (a) => <RiskScore value={a.risk_score} /> },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
    tab === "queue"
      ? { key: "exp", header: "Expires", cell: (a) => <Countdown to={a.expires_at} />, className: "hidden lg:table-cell" }
      : {
          key: "decided",
          header: "Decided by",
          className: "hidden lg:table-cell",
          cell: (a) => {
            const d = a.decisions.at(-1);
            return d ? <span className="num text-xs">{d.decided_by_email}</span> : <span className="text-muted-foreground">-</span>;
          },
        },
    { key: "created", header: "Requested", cell: (a) => <TimeAgo date={a.created_at} />, className: "hidden sm:table-cell" },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Risky actions held for a human decision. Highest risk first."
      />
      <Notice icon={UserCheck} title="Agents can request, only humans decide." className="mb-5">
        The requester cannot approve their own request (four-eyes rule). Every decision is enforced by the server and
        written to the audit log.
      </Notice>
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "queue" ? "/approvals" : `/approvals?tab=${v}`)}>
        <TabsList className="mb-3">
          <TabsTrigger value="queue">
            Pending <span className="num text-muted-foreground">{q.data ? queue.length : ""}</span>
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={q.data ? (tab === "queue" ? queue : history) : undefined}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        onRowClick={(a) => router.push(`/approvals/${a.id}`)}
        emptyTitle={tab === "queue" ? "Nothing waiting for a decision" : "No decisions yet"}
        emptyDescription={
          tab === "queue" ? "Held payments and refund requests will appear here." : "Approved, rejected and expired requests appear here."
        }
      />
      {tab === "queue" && q.data && queue.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClipboardCheck aria-hidden className="size-4" /> Open a request to review its context and decide.
        </p>
      )}
    </>
  );
}
