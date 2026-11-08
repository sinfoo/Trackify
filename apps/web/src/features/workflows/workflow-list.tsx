"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Play } from "lucide-react";
import { agentColors, DataTable, humanize, PageTitle, StatusBadge, TimeAgo, Tile, type Column } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Paged, Workflow } from "@/lib/types";
import { FilterChip } from "@/features/activity/filter-chip";

const PAGE_SIZE = 20;

/** Chip -> API `state`. "open" has no server filter: everything not terminal. */
const CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { key: "PAYMENT_FAILED", label: "Payment failed" },
  { key: "COMPLETED", label: "Completed" },
  { key: "open", label: "In progress" },
];
const TERMINAL = new Set(["COMPLETED", "PAYMENT_FAILED", "LOW_INTENT", "BLOCKED", "CANCELLED", "ERROR"]);

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const columns: Column<Workflow>[] = [
  {
    key: "label",
    header: "Workflow",
    cell: (w) => (
      <span className="inline-flex min-w-0 items-center gap-[9px]">
        <Tile icon={GitBranch} size={30} radius={10} iconSize={15} {...agentColors("orchestrator")} />
        <span className="min-w-0 leading-[1.2]">
          <span className="block truncate text-sm font-bold">{w.label}</span>
          <span className="num mt-px block truncate text-xs text-t3">{w.id.slice(0, 8)}</span>
        </span>
      </span>
    ),
  },
  { key: "state", header: "State", cell: (w) => <StatusBadge status={w.state} /> },
  {
    key: "customer",
    header: "Customer",
    cell: (w) =>
      w.customer_name ? (
        <span className="inline-flex min-w-0 items-center gap-[9px]">
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-panel3 text-[11px] font-extrabold">{initials(w.customer_name)}</span>
          <span className="truncate text-sm font-bold">{w.customer_name}</span>
        </span>
      ) : (
        <span className="text-t4">—</span>
      ),
  },
  { key: "kind", header: "Kind", cell: (w) => <span className="font-medium text-t3">{humanize(w.kind.toUpperCase())}</span> },
  { key: "updated", header: "Updated", align: "right", cell: (w) => <TimeAgo date={w.updated_at} className="text-[13px] font-medium text-t3" /> },
];

export function WorkflowList() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const open = filter === "open";
  const q = useQuery({
    queryKey: [...qk.workflows, "list", filter, open ? 1 : page],
    // ponytail: the API filters one state at a time; "In progress" fetches the latest 200 and filters here.
    queryFn: () =>
      api.get<Paged<Workflow>>("/workflows", {
        query: open ? { page: 1, page_size: 200 } : { state: filter === "all" ? undefined : filter, page, page_size: PAGE_SIZE },
      }),
    placeholderData: (prev) => prev,
  });

  const openRows = open ? q.data?.items.filter((w) => !TERMINAL.has(w.state)) : undefined;
  const rows = open ? openRows?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : q.data?.items;
  const total = open ? openRows?.length : q.data?.total;

  return (
    <>
      <PageTitle
        title="Workflows"
        description="Every customer journey and where it stands. Open one to replay each agent hand-off."
        actions={
          <Button asChild className="h-10 rounded-xl px-4">
            <Link href="/demo" className="no-underline hover:no-underline">
              <Play aria-hidden /> Run a scenario
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by state">
        {CHIPS.map((c) => (
          <FilterChip
            key={c.key}
            on={filter === c.key}
            onClick={() => {
              setFilter(c.key);
              setPage(1);
            }}
          >
            {c.label}
          </FilterChip>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(w) => w.id}
        loading={q.isPending}
        error={q.error}
        onRetry={() => q.refetch()}
        emptyTitle="No workflows in this state"
        emptyDescription="Change the filters or run a scenario from Demo control."
        onRowClick={(w) => router.push(`/workflows/${w.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
    </>
  );
}
