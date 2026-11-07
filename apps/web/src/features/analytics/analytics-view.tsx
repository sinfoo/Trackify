"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentAvatar, AGENT_META, ChartCard, DataTable, humanize, KpiCard, Money, PageHeader, SimulatedBadge, StatusBadge } from "@/components/ui-kit";
import { buildUrl } from "@/lib/api";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { AnalyticsFilters } from "@/lib/types";
import {
  SEGMENTS,
  useAgentStats,
  useConversion,
  useCustomerStats,
  useDefinitions,
  useOverview,
  usePaymentStats,
  useProducts,
  useProductStats,
  useRevenue,
  useSecurityStats,
  type ProductRow,
} from "./api";
import { BarList, Legend, PaymentOutcomeChart, RevenueChart, SecurityTrendChart, SEVERITY_SERIES, SplitBar } from "./charts";
import { Panel } from "./panel";

const KEYS = ["date_from", "date_to", "product_id", "segment"] as const;
export const PAYMENT_STATUSES = ["SUCCEEDED", "FAILED", "REQUIRES_APPROVAL", "PENDING", "PROCESSING", "CREATED", "REFUNDED", "CANCELLED"];
const REPORTS = ["financial", "customers", "transactions", "security", "agents"] as const;
const ALL = "all";
const label = (s: string) => humanize(String(s ?? "").toUpperCase());

function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters: AnalyticsFilters = {};
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }
  const set = (k: (typeof KEYS)[number], v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== ALL) next.set(k, v);
    else next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const clear = () => router.replace(pathname, { scroll: false });
  return { filters, set, clear };
}

export function AnalyticsView() {
  const { filters: f, set, clear } = useFilters();
  const defs = useDefinitions();
  const overview = useOverview(f);
  const revenue = useRevenue(f);
  const conversion = useConversion(f);
  const productStats = useProductStats(f);
  const payments = usePaymentStats(f);
  const customers = useCustomerStats(f);
  const security = useSecurityStats(f);
  const agents = useAgentStats(f);
  const products = useProducts();
  const o = overview.data;
  const active = KEYS.some((k) => f[k]);

  const kpis = [
    { key: "revenue", label: "Simulated revenue", value: o && <Money value={o.revenue} currency="" />, hint: "TND" },
    { key: "refunded", label: "Refunded", value: o && <Money value={o.refunded} currency="" />, hint: "TND" },
    { key: "avg_transaction_value", label: "Avg transaction value", value: o && <Money value={o.avg_transaction_value} currency="" />, hint: "TND" },
    { key: "conversion_rate", label: "Conversion rate", value: o && formatPercent(o.conversion_rate, { fromRatio: false }) },
    { key: "interactions", label: "Interactions", value: o && formatNumber(o.interactions) },
    { key: "interested_customers", label: "Interested customers", value: o && formatNumber(o.interested_customers) },
    { key: "enrollments", label: "Enrollments", value: o && formatNumber(o.enrollments) },
    {
      key: "satisfaction",
      label: "Satisfaction",
      value: o && (o.satisfaction == null ? "-" : `${o.satisfaction.toFixed(2)} / 5`),
      hint: o && `${formatNumber(o.feedback_count)} ratings`,
    },
  ];

  const funnel = conversion.data?.funnel ?? [];
  const first = funnel[0]?.customers || 0;

  return (
    <div className="analytics-print">
      {/* Print: drop the app chrome and controls, keep the report. */}
      <style>{`@media print{aside,header,[data-print-hide]{display:none!important}main{max-width:none!important;padding:0!important}.analytics-print section{break-inside:avoid}}`}</style>
      <PageHeader
        title="Analytics"
        description="Revenue, conversion, customers, security and agent performance. All payments are simulated."
        actions={
          <div data-print-hide className="flex flex-wrap items-center gap-2">
            <SimulatedBadge />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden /> Print report
            </Button>
          </div>
        }
      />

      <div data-print-hide className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="date_from">From</Label>
          <Input id="date_from" type="date" className="w-40" value={f.date_from ?? ""} max={f.date_to} onChange={(e) => set("date_from", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date_to">To</Label>
          <Input id="date_to" type="date" className="w-40" value={f.date_to ?? ""} min={f.date_from} onChange={(e) => set("date_to", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product">Product</Label>
          <Select value={f.product_id ?? ALL} onValueChange={(v) => set("product_id", v)}>
            <SelectTrigger id="product" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              {products.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="segment">Customer segment</Label>
          <Select value={f.segment ?? ALL} onValueChange={(v) => set("segment", v)}>
            <SelectTrigger id="segment" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All segments</SelectItem>
              {SEGMENTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {active && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden /> Clear filters
          </Button>
        )}
        <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3 lg:ml-auto lg:w-auto lg:border-0 lg:pt-0">
          <span className="text-sm text-muted-foreground">Export CSV</span>
          {REPORTS.map((k) => (
            <Button key={k} variant="outline" size="sm" asChild>
              <a href={buildUrl(`/reports/${k}.csv`, { ...f })} download={`${k}-report.csv`}>
                <Download aria-hidden /> {label(k)}
              </a>
            </Button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {f.date_from || f.date_to ? `Period ${f.date_from ?? "start"} to ${f.date_to ?? "today"}` : "All time (charts show the last 30 days)"}
        {f.segment ? `, segment ${label(f.segment)}` : ""}
        {f.product_id ? `, product ${products.data?.find((p) => p.id === f.product_id)?.name ?? "selected"}` : ""}
      </p>

      {overview.error ? (
        <Panel title="Key figures" q={overview} className="mb-6">
          {null}
        </Panel>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <KpiCard key={k.key} label={k.label} value={k.value} hint={k.hint} definition={defs[k.key]} loading={overview.isPending} />
          ))}
        </div>
      )}

      <h2 className="sr-only">Revenue</h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Revenue"
          description={
            o ? (
              <>
                Daily simulated revenue. Total <Money value={o.revenue} />, refunded <Money value={o.refunded} /> (excluded).
              </>
            ) : (
              "Daily simulated revenue"
            )
          }
          loading={revenue.isPending}
          error={revenue.error}
          onRetry={() => revenue.refetch()}
          className="lg:col-span-2"
        >
          {revenue.data && <RevenueChart data={revenue.data} />}
        </ChartCard>
        <ChartCard
          title="Payment outcomes"
          description="Succeeded and failed payments per day"
          loading={revenue.isPending}
          error={revenue.error}
          onRetry={() => revenue.refetch()}
          height={240}
        >
          <div className="flex h-full flex-col gap-3">
            <Legend items={[{ label: "Succeeded", color: "var(--chart-2)" }, { label: "Failed", color: "var(--danger)" }]} />
            <div className="min-h-0 flex-1">{revenue.data && <PaymentOutcomeChart data={revenue.data} />}</div>
          </div>
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Conversion funnel"
          description={
            conversion.data
              ? `Conversion rate ${formatPercent(conversion.data.conversion_rate, { fromRatio: false })}. ${defs.conversion_rate ?? ""}`
              : "Distinct customers at each stage"
          }
          q={conversion}
        >
          <BarList
            items={funnel.map((s) => ({
              key: s.stage,
              label: s.stage,
              value: s.customers,
              display: `${formatNumber(s.customers)}${first ? ` · ${formatPercent(s.customers / first, { digits: 0 })}` : ""}`,
            }))}
          />
        </Panel>
        <Panel
          title="Payment status"
          description={
            payments.data ? (
              <>
                {formatNumber(payments.data.pending_payments)} pending. {defs.pending_payments}
              </>
            ) : (
              "Transactions by status"
            )
          }
          q={payments}
        >
          <BarList
            items={PAYMENT_STATUSES.filter((s) => payments.data?.counts[s] !== undefined).map((s) => ({
              key: s,
              label: <StatusBadge status={s} />,
              value: payments.data?.counts[s] ?? 0,
            }))}
          />
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Products</h2>
          <DataTable<ProductRow>
            rows={productStats.data}
            loading={productStats.isPending}
            error={productStats.error}
            onRetry={() => productStats.refetch()}
            rowKey={(r) => r.product_id}
            emptyTitle="No products"
            skeletonRows={4}
            columns={[
              { key: "name", header: "Product", cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: "revenue", header: "Revenue", align: "right", cell: (r) => <Money value={r.revenue} /> },
              { key: "sales", header: "Sales", align: "right", cell: (r) => <span className="num">{r.sales}</span> },
              { key: "failed", header: "Failed", align: "right", cell: (r) => <span className="num">{r.failed}</span> },
              {
                key: "rate",
                header: "Pay success",
                align: "right",
                cell: (r) => <span className="num">{formatPercent(r.payment_success_rate, { fromRatio: false })}</span>,
              },
              { key: "seats", header: "Seats", align: "right", cell: (r) => <span className="num">{r.seats_taken}/{r.seats_total}</span> },
            ]}
          />
        </section>
        <Panel title="Revenue by product" description="Succeeded simulated payments" q={productStats}>
          <BarList
            items={(productStats.data ?? []).map((p) => ({
              key: p.product_id,
              label: p.name,
              value: Number(p.revenue),
              display: formatMoney(p.revenue, ""),
            }))}
          />
        </Panel>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Customers</h2>
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">{defs.objections}</p>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Sentiment" q={customers}>
          <BarList
            items={["positive", "neutral", "negative"].map((k) => ({ key: k, label: label(k), value: customers.data?.sentiment[k] ?? 0 }))}
          />
        </Panel>
        <Panel title="Purchase intent" description="Model estimate, by band" q={customers}>
          <BarList items={(customers.data?.intent ?? []).map((b) => ({ key: b.band, label: label(b.band), value: b.count }))} />
        </Panel>
        <Panel title="Top interests" q={customers}>
          <BarList items={(customers.data?.interests ?? []).slice(0, 6).map((i) => ({ key: i.interest, label: i.interest, value: i.count }))} />
        </Panel>
        <Panel title="Objections" q={customers}>
          <BarList
            items={(customers.data?.objections ?? []).slice(0, 6).map((i) => ({
              key: i.objection,
              label: label(i.objection),
              value: i.count,
              display: `${i.count} · ${formatPercent(i.share, { fromRatio: false, digits: 0 })}`,
            }))}
          />
        </Panel>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Security events"
          description={defs.security_alerts}
          loading={security.isPending}
          error={security.error}
          onRetry={() => security.refetch()}
          className="lg:col-span-2"
        >
          <div className="flex h-full flex-col gap-3">
            <Legend items={SEVERITY_SERIES.map((s) => ({ label: s.label, color: s.color }))} />
            <div className="min-h-0 flex-1">{security.data && <SecurityTrendChart data={security.data.series} />}</div>
          </div>
        </ChartCard>
        <Panel title="By category" q={security}>
          <BarList
            color="var(--chart-4)"
            items={Object.entries(security.data?.by_category ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => ({ key: k, label: label(k), value: n }))}
          />
        </Panel>
      </div>

      <Panel title="Agent executions" description="Succeeded and failed runs per agent, with mean duration" q={agents}>
        {agents.data && agents.data.length ? (
          <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {agents.data.map((a) => (
              <li key={a.agent_id} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <AgentAvatar agentId={a.agent_id} size="sm" />
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{AGENT_META[a.agent_id]?.name ?? a.agent_id}</span>
                    <span className="num text-muted-foreground">
                      {a.succeeded} ok · {a.failed} failed · {a.avg_ms} ms
                    </span>
                  </div>
                  <SplitBar ok={a.succeeded} failed={a.failed} label={`${a.succeeded} succeeded, ${a.failed} failed`} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No agent runs in this period</p>
        )}
        <div className="mt-4">
          <Legend items={[{ label: "Succeeded", color: "var(--chart-2)" }, { label: "Failed", color: "var(--danger)" }]} />
        </div>
      </Panel>
    </div>
  );
}
