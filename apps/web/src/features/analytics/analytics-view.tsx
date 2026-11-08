"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentAvatar, AGENT_META, DataTable, ErrorState, Eyebrow, humanize, KpiCard, Money, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { buildUrl } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { AnalyticsFilters } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Page } from "@/features/security/shared";
import {
  SEGMENTS,
  useAgentStats,
  useConversion,
  useCustomerStats,
  useDefinitions,
  useFeedback,
  useForecast,
  useOverview,
  usePaymentStats,
  useProducts,
  useProductStats,
  useRevenue,
  useSecurityStats,
  useSnapshot,
  type ProductRow,
} from "./api";
import { BarList, Donut, Legend, PaymentOutcomeChart, RevenueChart, SecurityTrendChart, SEVERITY_SERIES, SplitBar } from "./charts";
import { Panel } from "./panel";

const KEYS = ["date_from", "date_to", "product_id", "segment"] as const;
export const PAYMENT_STATUSES = ["SUCCEEDED", "FAILED", "REQUIRES_APPROVAL", "PENDING", "PROCESSING", "CREATED", "REFUNDED", "CANCELLED"];
// Same permission the API checks per export (apps/api/app/api/v1/analytics.py REPORTS).
const REPORTS = { financial: "analytics:read", customers: "customers:read", transactions: "payments:read", security: "security:read", agents: "agents:read" } as const;
const ALL = "all";
const RANGES = [
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
  ["1y", 365],
] as const;
const label = (s: string) => humanize(String(s ?? "").toUpperCase());
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters: AnalyticsFilters = {};
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) filters[k] = v;
  }
  const replace = (next: URLSearchParams) => {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const set = (k: (typeof KEYS)[number], v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== ALL) next.set(k, v);
    else next.delete(k);
    replace(next);
  };
  const setRange = (days: number) => {
    const next = new URLSearchParams(params);
    next.set("date_from", daysAgo(days));
    next.delete("date_to");
    replace(next);
  };
  const clear = () => router.replace(pathname, { scroll: false });
  return { filters, set, setRange, clear };
}

/** Previous window of the same length, for the KPI deltas. Only when a start date is set. */
function previousWindow(f: AnalyticsFilters): AnalyticsFilters | null {
  if (!f.date_from) return null;
  const from = new Date(`${f.date_from}T00:00:00Z`);
  const to = f.date_to ? new Date(`${f.date_to}T00:00:00Z`) : new Date();
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  const pTo = new Date(from);
  pTo.setUTCDate(pTo.getUTCDate() - 1);
  const pFrom = new Date(pTo);
  pFrom.setUTCDate(pFrom.getUTCDate() - span);
  return { ...f, date_from: iso(pFrom), date_to: iso(pTo) };
}
const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

export function AnalyticsView() {
  const { data: me } = useMe();
  const { filters: f, set, setRange, clear } = useFilters();
  const defs = useDefinitions();
  const overview = useOverview(f);
  const prevF = previousWindow(f);
  const prev = useOverview(prevF ?? f);
  const revenue = useRevenue(f);
  const conversion = useConversion(f);
  const productStats = useProductStats(f);
  const payments = usePaymentStats(f);
  const customers = useCustomerStats(f);
  const feedback = useFeedback(f);
  const forecast = useForecast();
  const security = useSecurityStats(f);
  const agents = useAgentStats(f);
  const products = useProducts();
  const snapshot = useSnapshot();
  const o = overview.data;
  const p = prevF ? prev.data : undefined;
  const active = KEYS.some((k) => f[k]);
  const rangeActive = (days: number) => f.date_from === daysAgo(days) && !f.date_to;

  const revSpark = revenue.data?.map((d) => Number(d.revenue));
  const fcSpark = forecast.data?.points.map((x) => Number(x.revenue));
  type Kpi = { key: string; label: string; value?: ReactNode; unit?: string; delta?: number | null; deltaLabel?: string; goodWhen?: "up" | "down"; hint?: ReactNode; spark?: number[]; sparkColor?: string };
  const kpis: Kpi[] = [
    { key: "revenue", label: "Revenue", value: o && formatMoney(o.revenue, ""), unit: "TND", delta: o && p ? pct(Number(o.revenue), Number(p.revenue)) : null, deltaLabel: "% vs previous", spark: revSpark },
    { key: "conversion_rate", label: "Conversion", value: o && o.conversion_rate.toFixed(1), unit: "%", delta: o && p ? Math.round((o.conversion_rate - p.conversion_rate) * 10) / 10 : null, deltaLabel: " pts" },
    { key: "interactions", label: "Interactions", value: o && formatNumber(o.interactions), delta: o && p ? o.interactions - p.interactions : null, deltaLabel: " vs previous" },
    { key: "avg_transaction_value", label: "Avg transaction", value: o && formatMoney(o.avg_transaction_value, ""), unit: "TND", delta: o && p ? pct(Number(o.avg_transaction_value), Number(p.avg_transaction_value)) : null, deltaLabel: "% vs previous" },
    { key: "satisfaction", label: "Satisfaction", value: o && (o.satisfaction == null ? "—" : o.satisfaction.toFixed(2)), unit: "/ 5", hint: o && `${formatNumber(o.feedback_count)} reviews` },
    {
      key: "forecast",
      label: "Forecast · 7d",
      value: forecast.data ? formatMoney(forecast.data.total, "") : undefined,
      unit: "TND",
      hint: forecast.data ? `linear trend, R² ${forecast.data.r2 ?? "n/a"}` : undefined,
      spark: fcSpark,
      sparkColor: "var(--info)",
    },
    { key: "refunded", label: "Refunded", value: o && formatMoney(o.refunded, ""), unit: "TND", delta: o && p ? pct(Number(o.refunded), Number(p.refunded)) : null, deltaLabel: "% vs previous", goodWhen: "down" as const },
    { key: "enrollments", label: "Enrollments", value: o && formatNumber(o.enrollments), delta: o && p ? o.enrollments - p.enrollments : null, deltaLabel: " vs previous" },
    { key: "interested_customers", label: "Interested customers", value: o && formatNumber(o.interested_customers), delta: o && p ? o.interested_customers - p.interested_customers : null, deltaLabel: " vs previous" },
  ];

  const funnel = conversion.data?.funnel ?? [];
  const first = funnel[0]?.customers || 0;
  const lastStage = funnel.at(-1);
  const counts = payments.data?.counts ?? {};
  const attempts = PAYMENT_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const held = (counts.REQUIRES_APPROVAL ?? 0) + (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0) + (counts.CREATED ?? 0);
  const slices = [
    { key: "ok", label: "Succeeded", value: counts.SUCCEEDED ?? 0, color: "var(--success)" },
    { key: "failed", label: "Failed", value: counts.FAILED ?? 0, color: "var(--danger)" },
    { key: "held", label: "Held / pending", value: held, color: "var(--warning)" },
    { key: "refunded", label: "Refunded", value: counts.REFUNDED ?? 0, color: "var(--neutral)" },
    ...(counts.CANCELLED ? [{ key: "cancelled", label: "Cancelled", value: counts.CANCELLED, color: "var(--t4)" }] : []),
  ];
  const objections = customers.data?.objections ?? [];
  const objTotal = objections.reduce((s, x) => s + x.count, 0);
  const days = revenue.data?.length ?? 30;
  const snap = snapshot.data;

  return (
    <Page
      title="Analytics"
      description="Computed by the Financial Data Analyst with exact decimal arithmetic. Narratives are model output; numbers are not."
      className="analytics-print"
      actions={
        <div className="inline-flex rounded-xl border border-hair bg-panel p-[3px]" role="group" aria-label="Period">
          {RANGES.map(([lbl, days]) => (
            <button
              key={lbl}
              type="button"
              aria-pressed={rangeActive(days)}
              onClick={() => (rangeActive(days) ? clear() : setRange(days))}
              className={cn("grid h-[30px] place-items-center rounded-[9px] px-3 text-[12.5px] font-bold transition-colors", rangeActive(days) ? "bg-text text-bg" : "text-t2 hover:text-text")}
            >
              {lbl}
            </button>
          ))}
        </div>
      }
    >
      {/* Print: drop the app chrome and controls, keep the report. */}
      <style>{`@media print{aside,header,[data-print-hide]{display:none!important}main{max-width:none!important;padding:0!important}.analytics-print section{break-inside:avoid}}`}</style>

      <div data-print-hide className="flex flex-wrap items-end gap-3 rounded-[22px] border border-hair bg-panel px-5 py-3.5 shadow-card">
        <div className="grid gap-1">
          <Label htmlFor="date_from" className="text-xs text-t3">
            From
          </Label>
          <Input id="date_from" type="date" className="w-40" value={f.date_from ?? ""} max={f.date_to} onChange={(e) => set("date_from", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="date_to" className="text-xs text-t3">
            To
          </Label>
          <Input id="date_to" type="date" className="w-40" value={f.date_to ?? ""} min={f.date_from} onChange={(e) => set("date_to", e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="product" className="text-xs text-t3">
            Product
          </Label>
          <Select value={f.product_id ?? ALL} onValueChange={(v) => set("product_id", v)}>
            <SelectTrigger id="product" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              {products.data?.map((pr) => (
                <SelectItem key={pr.id} value={pr.id}>
                  {pr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="segment" className="text-xs text-t3">
            Customer segment
          </Label>
          <Select value={f.segment ?? ALL} onValueChange={(v) => set("segment", v)}>
            <SelectTrigger id="segment" className="w-44">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-t3">Export CSV</span>
          {(Object.keys(REPORTS) as (keyof typeof REPORTS)[])
            .filter((k) => can(me, REPORTS[k]))
            .map((k) => (
              <Button key={k} variant="outline" size="sm" asChild>
                <a href={buildUrl(`/reports/${k}.csv`, { ...f })} download={`${k}-report.csv`} className="no-underline hover:no-underline">
                  <Download aria-hidden /> {label(k)}
                </a>
              </Button>
            ))}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden /> Print
          </Button>
        </div>
      </div>

      <p className="-mt-2 text-[13px] text-t3">
        {f.date_from || f.date_to ? `Period ${f.date_from ?? "start"} to ${f.date_to ?? "today"}` : "All time (charts show the last 30 days)"}
        {f.segment ? `, segment ${label(f.segment)}` : ""}
        {f.product_id ? `, product ${products.data?.find((pr) => pr.id === f.product_id)?.name ?? "selected"}` : ""}
        {prevF ? " · deltas compare with the previous period of the same length" : ""}
      </p>

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {kpis.map((k) => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              unit={k.unit}
              delta={k.delta ?? undefined}
              deltaLabel={k.deltaLabel}
              goodWhen={k.goodWhen}
              hint={k.hint}
              spark={k.spark}
              sparkColor={k.sparkColor}
              definition={defs[k.key]}
              loading={overview.isPending || (k.key === "forecast" && forecast.isPending)}
            />
          ))}
        </div>
      )}

      {snap && (
        <section className="flex items-start gap-3.5 rounded-[22px] border border-hair bg-panel p-5 shadow-card" aria-label="Analyst narrative">
          <AgentAvatar agentId="analyst" size={40} />
          <div className="min-w-0">
            <Eyebrow>{AGENT_META.analyst.full}</Eyebrow>
            <p className="mt-0.5 text-sm font-extrabold">
              Latest analysis <TimeAgo date={snap.created_at} />, trigger <span className="num text-[12.5px] font-semibold text-t2">{snap.trigger}</span>
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-t2">{snap.narrative}</p>
            <p className="mt-2 text-xs text-t4">Narrative is model output. Every figure above is computed from the ledger.</p>
          </div>
        </section>
      )}

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        <Panel
          title="Revenue · succeeded simulated payments per day"
          description={o ? `${formatMoney(o.revenue)} over ${days} days` : "Daily simulated revenue"}
          actions={
            <Legend
              items={[
                { label: "This period", color: "var(--brand)" },
                ...(forecast.data?.points.length ? [{ label: "+7 days forecast", color: "var(--info)", dashed: true }] : []),
              ]}
            />
          }
          q={revenue}
          className="col-span-full"
        >
          <div className="h-[220px]">{revenue.data && <RevenueChart data={revenue.data} forecast={f.date_to ? [] : forecast.data?.points} />}</div>
          {o && (
            <p className="mt-2 text-xs text-t3">
              Refunded <Money value={o.refunded} /> is excluded from revenue.
            </p>
          )}
        </Panel>

        <Panel title="Conversion funnel" description={conversion.data ? `${formatNumber(first)} engaged → ${formatNumber(lastStage?.customers ?? 0)} enrolled · ${formatPercent(conversion.data.conversion_rate, { fromRatio: false })}` : "Distinct customers at each stage"} q={conversion}>
          <BarList
            thick
            labelWidth={150}
            valueWidth={90}
            items={funnel.map((s) => ({
              key: s.stage,
              label: s.stage,
              value: s.customers,
              display: `${formatNumber(s.customers)} · ${first ? formatPercent(s.customers / first, { digits: 0 }) : "0%"}`,
            }))}
          />
          {defs.conversion_rate && <p className="mt-3 text-xs text-t4">{defs.conversion_rate}</p>}
        </Panel>

        <Panel title="Payments by status" description={payments.data ? `${formatNumber(attempts)} attempts · ${attempts ? Math.round(((counts.SUCCEEDED ?? 0) / attempts) * 100) : 0}% succeed` : "Transactions by status"} q={payments}>
          <Donut slices={slices} centre={formatNumber(counts.SUCCEEDED ?? 0)} caption="succeeded" />
          {payments.data && (
            <p className="mt-3 text-xs text-t4">
              {formatNumber(payments.data.pending_payments)} pending. {defs.pending_payments}
            </p>
          )}
        </Panel>

        <Panel title="Top objections" description={objTotal ? `What stops people · ${formatNumber(objTotal)} objections recorded` : "What stops people"} q={customers}>
          <BarList
            items={objections.slice(0, 6).map((i) => ({ key: i.objection, label: label(i.objection), value: i.count, display: formatPercent(i.share, { fromRatio: false, digits: 0 }) }))}
          />
        </Panel>

        <Panel title="Agent performance" description="Success rate and median duration" q={agents}>
          {agents.data && agents.data.length ? (
            <ul className="grid gap-2.5">
              {agents.data.map((a) => {
                const total = a.succeeded + a.failed;
                const ok = total ? Math.round((a.succeeded / total) * 100) : 0;
                return (
                  <li key={a.agent_id} className="grid grid-cols-[28px_110px_1fr_80px] items-center gap-2.5 text-[13px]">
                    <AgentAvatar agentId={a.agent_id} size={28} />
                    <span className="truncate font-bold">{AGENT_META[a.agent_id]?.name ?? a.agent_id}</span>
                    <SplitBar ok={a.succeeded} failed={a.failed} label={`${a.succeeded} succeeded, ${a.failed} failed`} />
                    <span className="num text-right text-xs text-t3">
                      {ok}% · {a.avg_ms}ms
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-t3">No agent runs in this period</p>
          )}
        </Panel>

        <Panel title="Payment outcomes" description="Succeeded and failed payments per day" actions={<Legend items={[{ label: "Succeeded", color: "var(--success)" }, { label: "Failed", color: "var(--danger)" }]} />} q={revenue}>
          <div className="h-[200px]">{revenue.data && <PaymentOutcomeChart data={revenue.data} />}</div>
        </Panel>

        <section className="col-span-full min-w-0" aria-label="Top programs">
          <div className="mb-2.5 px-1">
            <Eyebrow>Top programs</Eyebrow>
            <h3 className="mt-0.5 text-base font-extrabold">Revenue, sales and seats per program</h3>
          </div>
          <DataTable<ProductRow>
            rows={productStats.data}
            loading={productStats.isPending}
            error={productStats.error}
            onRetry={() => productStats.refetch()}
            rowKey={(r) => r.product_id}
            emptyTitle="No products"
            skeletonRows={4}
            columns={[
              {
                key: "name",
                header: "Program",
                cell: (r) => (
                  <span className="block min-w-0">
                    <span className="block truncate text-sm font-bold">{r.name}</span>
                    <span className="block text-xs text-t3">{r.category}</span>
                  </span>
                ),
              },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { key: "revenue", header: "Revenue", align: "right", cell: (r) => <Money value={r.revenue} className="text-[13px]" /> },
              { key: "sales", header: "Sales", align: "right", cell: (r) => <span className="num text-[13px]">{r.sales}</span> },
              { key: "failed", header: "Failed", align: "right", cell: (r) => <span className="num text-[13px]">{r.failed}</span> },
              { key: "rate", header: "Pay success", align: "right", cell: (r) => <span className="num text-[13px]">{formatPercent(r.payment_success_rate, { fromRatio: false })}</span> },
              {
                key: "seats",
                header: "Seats",
                align: "right",
                cell: (r) => (
                  <span className="num text-[13px]">
                    {r.seats_taken}/{r.seats_total}
                  </span>
                ),
              },
            ]}
          />
        </section>

        <Panel title="Revenue by program" description="Succeeded simulated payments" q={productStats}>
          <BarList color="var(--brand)" items={(productStats.data ?? []).map((pr) => ({ key: pr.product_id, label: pr.name, value: Number(pr.revenue), display: formatMoney(pr.revenue, "") }))} />
        </Panel>
        <Panel title="Sentiment" description="Across analysed conversations" q={customers}>
          <BarList
            items={["positive", "neutral", "negative"].map((k) => ({
              key: k,
              label: label(k),
              value: customers.data?.sentiment[k] ?? 0,
              color: k === "positive" ? "var(--success)" : k === "negative" ? "var(--danger)" : "var(--neutral)",
            }))}
          />
        </Panel>
        <Panel title="Purchase intent" description="Model estimate, by band" q={customers}>
          <BarList items={(customers.data?.intent ?? []).map((b) => ({ key: b.band, label: label(b.band), value: b.count }))} />
        </Panel>
        <Panel title="Top interests" description="What prospects ask about" q={customers}>
          <BarList items={(customers.data?.interests ?? []).slice(0, 6).map((i) => ({ key: i.interest, label: i.interest, value: i.count }))} />
        </Panel>

        <Panel title="Satisfaction" description={feedback.data ? `${formatNumber(feedback.data.count)} reviews · average ${feedback.data.average ?? "n/a"} / 5` : "Ratings distribution"} q={feedback}>
          <BarList color="var(--brand)" items={["5", "4", "3", "2", "1"].map((r) => ({ key: r, label: `${r} stars`, value: feedback.data?.distribution[r] ?? 0 }))} />
        </Panel>
        <Panel title="Themes in critical feedback" description={feedback.data ? `${feedback.data.low_ratings} low ratings, ${feedback.data.negative_comments} negative comments` : undefined} q={feedback}>
          <BarList color="var(--danger)" items={(feedback.data?.themes ?? []).map((t) => ({ key: t.theme, label: label(t.theme), value: t.count }))} empty="No critical themes" />
        </Panel>
        <Panel title="Revenue forecast · next 7 days" description={forecast.data ? formatMoney(forecast.data.total) : undefined} q={forecast}>
          {forecast.data && forecast.data.points.length > 0 ? (
            <>
              <BarList color="var(--info)" items={forecast.data.points.map((x) => ({ key: x.date, label: x.date.slice(5), value: Number(x.revenue), display: formatMoney(x.revenue, "") }))} />
              <p className="mt-3 text-xs text-t4">
                R² <span className="num">{forecast.data.r2 ?? "n/a"}</span>. {forecast.data.note} {defs.forecast}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-t3">{forecast.data?.note}</p>
          )}
        </Panel>

        <Panel title="Security events" description="Per day, by severity" actions={<Legend items={SEVERITY_SERIES.map((s) => ({ label: s.label, color: s.color }))} />} q={security} className="xl:col-span-2">
          <div className="h-[200px]">{security.data && <SecurityTrendChart data={security.data.series} />}</div>
          {defs.security_alerts && <p className="mt-2 text-xs text-t4">{defs.security_alerts}</p>}
        </Panel>
        <Panel title="Security by category" description="All severities" q={security}>
          <BarList
            color="var(--c-security)"
            items={Object.entries(security.data?.by_category ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => ({ key: k, label: label(k), value: n }))}
          />
        </Panel>
      </div>
    </Page>
  );
}
