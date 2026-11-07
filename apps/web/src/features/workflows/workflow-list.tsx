"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DataTable, humanize, PageHeader, StatusBadge, TimeAgo, type Column } from "@/components/ui-kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { WORKFLOW_STATES, type Paged, type Workflow } from "@/lib/types";

const PAGE_SIZE = 20;

const columns: Column<Workflow>[] = [
  {
    key: "label",
    header: "Workflow",
    cell: (w) => (
      <div className="min-w-0">
        <p className="font-medium">{w.label}</p>
        <p className="num text-xs text-muted-foreground">{w.id.slice(0, 8)}</p>
      </div>
    ),
  },
  { key: "state", header: "State", cell: (w) => <StatusBadge status={w.state} /> },
  { key: "customer", header: "Customer", className: "hidden md:table-cell", cell: (w) => w.customer_name ?? "-" },
  { key: "kind", header: "Kind", className: "hidden lg:table-cell", cell: (w) => <span className="text-muted-foreground">{humanize(w.kind.toUpperCase())}</span> },
  { key: "updated", header: "Updated", align: "right", cell: (w) => <TimeAgo date={w.updated_at} className="text-sm text-muted-foreground" /> },
];

export function WorkflowList() {
  const router = useRouter();
  const [state, setState] = useState("all");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [...qk.workflows, "list", state, page],
    queryFn: () =>
      api.get<Paged<Workflow>>("/workflows", { query: { state: state === "all" ? undefined : state, page, page_size: PAGE_SIZE } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Customer journeys and where each one stands. Open one to see every agent hand-off."
        actions={
          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56" aria-label="Filter by state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {WORKFLOW_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(w) => w.id}
        loading={q.isPending}
        error={q.error}
        onRetry={() => q.refetch()}
        emptyTitle="No workflows in this state"
        emptyDescription="Run a scenario from Demo control to create one."
        onRowClick={(w) => router.push(`/workflows/${w.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={q.data?.total}
        onPageChange={setPage}
      />
    </>
  );
}
