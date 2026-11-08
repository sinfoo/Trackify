"use client";

import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Minus, ThumbsUp, CircleX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, KpiCard, Money, PageTitle, RiskBar, StatusBadge, TimeAgo, TonePill, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Customer, OverviewKpis, Paged } from "@/lib/types";
import {
  FilterChip,
  FilterSelect,
  ListPage,
  SearchBox,
  Toolbar,
  WhoCell,
  actionBtn,
  initialsOf,
  tighten,
  useDebouncedSearch,
  useUrlParams,
} from "@/features/payments/shared";

// Values the backend writes (seed.py SEGMENTS, agents/intelligence.py stages, Customer default "NEW").
export const SEGMENTS = ["student", "professional", "career_switcher", "company", "individual"];
export const STAGES = ["NEW", "AWARENESS", "CONSIDERATION", "INTENT", "PURCHASED", "CUSTOMER", "LOST"];

const PAGE_SIZE = 25;

/** Prototype intent cell: 56px bar + value, coloured by band (the prototype reuses its risk() helper). */
export function IntentBar({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-t4">—</span>;
  return <RiskBar score={Math.round(value * 100)} />;
}

/** Positive success · Neutral neutral · Negative danger (prototype STATUS map). */
export function Sentiment({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="text-t4">—</span>;
  const l = label.toLowerCase();
  const [tone, Icon] = l.startsWith("pos") ? (["success", ThumbsUp] as const) : l.startsWith("neg") ? (["danger", CircleX] as const) : (["neutral", Minus] as const);
  return <TonePill tone={tone} icon={Icon} label={humanize(label.toUpperCase())} className="h-6 px-[9px]" />;
}

export function Chips({ items, max = 2 }: { items: string[] | null | undefined; max?: number }) {
  if (!items?.length) return <span className="text-t4">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.slice(0, max).map((o) => (
        <span key={o} className="rounded-lg bg-panel3 px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
          {o}
        </span>
      ))}
      {items.length > max && (
        <span className="px-1 text-xs text-t3" title={items.slice(max).join(", ")}>
          +{items.length - max}
        </span>
      )}
    </span>
  );
}

const columns: Column<Customer>[] = [
  { key: "name", header: "Customer", cell: (c) => <WhoCell className="max-w-[260px]" initials={initialsOf(c.full_name)} title={c.full_name} sub={c.email ?? "No email"} /> },
  { key: "stage", header: "Stage", cell: (c) => (c.journey_stage ? <StatusBadge status={c.journey_stage} className="h-6 px-[9px]" /> : <span className="text-t4">—</span>) },
  { key: "intent", header: "Intent", cell: (c) => <IntentBar value={c.purchase_intent} /> },
  { key: "sentiment", header: "Sentiment", cell: (c) => <Sentiment label={c.sentiment_label} /> },
  { key: "spent", header: "Spent", align: "right", cell: (c) => <Money value={c.total_spent} className="text-[13px] font-semibold" /> },
  { key: "since", header: "Since", align: "right", cell: (c) => <TimeAgo date={c.created_at} className="text-[13px] font-medium text-t3" /> },
];

function CustomerKpis() {
  const { data: me } = useMe();
  const enabled = can(me, "analytics:read");
  const kpis = useQuery({ queryKey: [...qk.analytics, "overview"], queryFn: () => api.get<OverviewKpis>("/analytics/overview"), enabled });
  if (!enabled || kpis.error) return null;
  const d = kpis.data;
  const loading = kpis.isPending;
  const pct = d && d.customers_engaged ? Math.round((d.interested_customers / d.customers_engaged) * 100) : 0;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      <KpiCard label="Engaged" loading={loading} value={d?.customers_engaged ?? 0} hint={<span className="font-semibold text-t3">had a conversation</span>} />
      <KpiCard label="Interested" loading={loading} value={d?.interested_customers ?? 0} hint={<span className="font-semibold text-t3">{pct}% of engaged</span>} />
      <KpiCard label="Enrolled" loading={loading} value={d?.enrollments ?? 0} hint={<span className="font-semibold text-t3">conversion {formatPercent(d?.conversion_rate, { fromRatio: false })}</span>} />
      <KpiCard label="Interactions" loading={loading} value={d?.interactions ?? 0} hint={<span className="font-semibold text-t3">messages exchanged</span>} />
    </div>
  );
}

export function CustomersView() {
  const router = useRouter();
  const [sp, setParams] = useUrlParams();
  const q = sp.get("q") ?? "";
  const segment = sp.get("segment") ?? "";
  const stage = sp.get("stage") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useDebouncedSearch(q, (v) => setParams({ q: v }));

  const list = useQuery({
    queryKey: [...qk.customers, "list", { q, segment, stage, page }],
    queryFn: () => api.get<Paged<Customer>>("/customers", { query: { q, segment, stage, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <ListPage>
      <PageTitle
        title="Customers"
        description="Profiles the Intelligence agent built from conversations: stage, intent, sentiment and objections."
        actions={
          <Button variant="outline" className={actionBtn} onClick={() => toast("Export is not available on this API yet")}>
            <Download aria-hidden /> Export CSV
          </Button>
        }
      />
      <CustomerKpis />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search customers…" label="Search customers" />
        <FilterChip selected={!stage} onClick={() => setParams({ stage: null })} count={list.data && !stage ? list.data.total : undefined}>
          All
        </FilterChip>
        {STAGES.map((s) => (
          <FilterChip key={s} selected={stage === s} onClick={() => setParams({ stage: s })} count={stage === s ? list.data?.total : undefined}>
            {humanize(s)}
          </FilterChip>
        ))}
        <FilterSelect label="Segment" value={segment} onChange={(v) => setParams({ segment: v || null })}>
          <option value="">All segments</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {humanize(s.toUpperCase())}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>
      <DataTable
        columns={tighten(columns)}
        rows={list.data?.items}
        rowKey={(c) => c.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle="No customers match"
        emptyDescription={q || segment || stage ? "Change the filters or run a scenario from Demo control." : "Customers appear after a first conversation."}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        page={list.data?.page ?? page}
        pageSize={list.data?.page_size ?? PAGE_SIZE}
        total={list.data?.total}
        onPageChange={(p) => setParams({ page: String(p) })}
        minWidth={860}
      />
    </ListPage>
  );
}
