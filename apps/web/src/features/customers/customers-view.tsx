"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Frown, Meh, Search, Smile } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, Money, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { Customer, Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { selectClass, useUrlParams } from "@/features/payments/shared";

// Values the backend writes (seed.py SEGMENTS, agents/intelligence.py stages, Customer default "NEW").
export const SEGMENTS = ["student", "professional", "career_switcher", "company", "individual"];
export const STAGES = ["NEW", "AWARENESS", "CONSIDERATION", "INTENT", "PURCHASED", "CUSTOMER", "LOST"];

const PAGE_SIZE = 25;

export function IntentBar({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>;
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="meter"
        aria-label="Purchase intent"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-sm">{pct}%</span>
    </span>
  );
}

export function Sentiment({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="text-muted-foreground">-</span>;
  const l = label.toLowerCase();
  const [Icon, cls] = l.startsWith("pos")
    ? [Smile, "text-success-text"]
    : l.startsWith("neg")
      ? [Frown, "text-danger-text"]
      : [Meh, "text-muted-foreground"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", cls)}>
      <Icon aria-hidden className="size-4" />
      {humanize(label.toUpperCase())}
    </span>
  );
}

export function Chips({ items, max = 2 }: { items: string[] | null | undefined; max?: number }) {
  if (!items?.length) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.slice(0, max).map((o) => (
        <span key={o} className="rounded-md border bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap">
          {o}
        </span>
      ))}
      {items.length > max && (
        <span className="px-1 text-xs text-muted-foreground" title={items.slice(max).join(", ")}>
          +{items.length - max}
        </span>
      )}
    </span>
  );
}

const columns: Column<Customer>[] = [
  {
    key: "name",
    header: "Name",
    cell: (c) => (
      <Link href={`/customers/${c.id}`} className="font-medium text-info-text hover:underline">
        {c.full_name}
      </Link>
    ),
  },
  { key: "email", header: "Email", cell: (c) => <span className="text-muted-foreground">{c.email ?? "-"}</span> },
  { key: "segment", header: "Segment", cell: (c) => (c.segment ? humanize(c.segment.toUpperCase()) : "-") },
  { key: "city", header: "City", cell: (c) => c.city ?? "-" },
  { key: "stage", header: "Stage", cell: (c) => (c.journey_stage ? humanize(c.journey_stage) : "-") },
  { key: "intent", header: "Purchase intent", cell: (c) => <IntentBar value={c.purchase_intent} /> },
  { key: "sentiment", header: "Sentiment", cell: (c) => <Sentiment label={c.sentiment_label} /> },
  { key: "objections", header: "Objections", cell: (c) => <Chips items={c.objections} /> },
  { key: "orders", header: "Orders", align: "right", cell: (c) => <span className="num">{c.orders_count}</span> },
  { key: "spent", header: "Total spent", align: "right", cell: (c) => <Money value={c.total_spent} /> },
];

export function CustomersView() {
  const [sp, setParams] = useUrlParams();
  const q = sp.get("q") ?? "";
  const segment = sp.get("segment") ?? "";
  const stage = sp.get("stage") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const list = useQuery({
    queryKey: [...qk.customers, "list", { q, segment, stage, page }],
    queryFn: () =>
      api.get<Paged<Customer>>("/customers", { query: { q, segment, stage, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-1.5 sm:w-72">
          <Label htmlFor="customer-search">Search</Label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input
              id="customer-search"
              type="search"
              placeholder="Name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="customer-segment">Segment</Label>
          <select
            id="customer-segment"
            className={selectClass}
            value={segment}
            onChange={(e) => setParams({ segment: e.target.value })}
          >
            <option value="">All segments</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {humanize(s.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="customer-stage">Journey stage</Label>
          <select
            id="customer-stage"
            className={selectClass}
            value={stage}
            onChange={(e) => setParams({ stage: e.target.value })}
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(c) => c.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle="No customers match"
        emptyDescription={q || segment || stage ? "Try clearing a filter." : "Customers appear after a first conversation."}
        page={list.data?.page ?? page}
        pageSize={list.data?.page_size ?? PAGE_SIZE}
        total={list.data?.total}
        onPageChange={(p) => setParams({ page: String(p) })}
      />
    </div>
  );
}
