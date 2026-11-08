"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hand, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AgentAvatar,
  AGENT_META,
  ChartCard,
  ErrorState,
  humanize,
  Money,
  SeverityBadge,
  SimulatedBadge,
  StatusBadge,
  TimeAgo,
} from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { api } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe, usePendingApprovalsCount } from "@/lib/queries";
import type { AgentView, Paged, SecurityEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useConversion, useDefinitions, useFeedback, useForecast, useOverview, useRevenue, useSnapshot } from "@/features/analytics/api";
import { PAYMENT_STATUSES } from "@/features/analytics/analytics-view";
import { BarList, RevenueChart } from "@/features/analytics/charts";
import { Panel } from "@/features/analytics/panel";
import { confidencePct, useRecommendations } from "@/features/strategy/strategy-view";

const label = (s: string) => humanize(String(s ?? "").toUpperCase());

const SIX = ["sales", "intelligence", "payment", "analyst", "strategy", "security"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-info-text hover:underline">
      {children} <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

/** Compact figure: label + info tooltip, mono value, optional hint. */
function Figure({ label, value, definition, hint, big }: { label: string; value: ReactNode; definition?: string; hint?: ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        {definition && (
          <Tooltip>
            <TooltipTrigger aria-label={`Definition of ${label}`} className="rounded-sm text-muted-foreground/80 hover:text-foreground">
              <Info aria-hidden className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-sm">{definition}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={cn("num mt-1 font-semibold tracking-tight break-words", big ? "text-2xl xl:text-3xl" : "text-xl")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function DashboardView() {
  const { data: user } = useMe();
  const canAnalytics = can(user, "analytics:read");
  const canSecurity = can(user, "security:read");
  const canStrategy = can(user, "strategy:read");
  const first = user?.full_name.split(" ")[0];

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {first}
          </h1>
          <p className="mt-1 text-muted-foreground">Sales, payments, security and agent work at a glance.</p>
        </div>
        <SimulatedBadge label="Simulated payments, fictional data" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {canAnalytics && <KeyFigures />}
        <div className={cn("flex flex-col gap-4", canAnalytics ? "lg:col-span-4" : "lg:col-span-12")}>
          <ApprovalsCallout />
          {canAnalytics && <AnalystNote />}
        </div>

        {canAnalytics && <RevenueAndFunnel />}

        <AgentStrip />

        <RecentActivity wide={!canSecurity && !canStrategy} />
        {(canSecurity || canStrategy) && (
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            {canSecurity && <OpenAlerts />}
            {canStrategy && <LatestRecommendations />}
          </div>
        )}

        {canAnalytics && <PaymentsAndObjections />}
        {canAnalytics && <TrustAndOutlook />}
      </div>
    </>
  );
}

function KeyFigures() {
  const o = useOverview();
  const defs = useDefinitions();
  const d = o.data;
  return (
    <section aria-label="Key figures" className="min-w-0 rounded-xl border bg-card p-5 lg:col-span-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Key figures</h2>
        <MoreLink href="/analytics">Analytics</MoreLink>
      </div>
      {o.error ? (
        <ErrorState error={o.error} onRetry={() => o.refetch()} />
      ) : !d ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Figure big label="Simulated revenue" value={<Money value={d.revenue} currency="" />} definition={defs.revenue} hint={<>TND, refunded <Money value={d.refunded} currency="" /></>} />
            <Figure big label="Conversion rate" value={formatPercent(d.conversion_rate, { fromRatio: false })} definition={defs.conversion_rate} hint={`${formatNumber(d.enrollments)} enrollments`} />
            <Figure
              big
              label="Interested customers"
              value={formatNumber(d.interested_customers)}
              definition={defs.interested_customers}
              hint={`of ${formatNumber(d.customers_engaged)} engaged`}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t pt-4 sm:grid-cols-4">
            <Figure label="Interactions" value={formatNumber(d.interactions)} definition={defs.interactions} />
            <Figure label="Succeeded" value={formatNumber(d.payments.SUCCEEDED ?? 0)} definition={defs.payments_succeeded} />
            <Figure label="Failed" value={formatNumber(d.payments.FAILED ?? 0)} definition={defs.payments_failed} />
            <Figure label="Pending" value={formatNumber(d.pending_payments)} definition={defs.pending_payments} />
            <Figure label="Avg transaction" value={<Money value={d.avg_transaction_value} currency="" />} definition={defs.avg_transaction_value} hint="TND" />
            <Figure
              label="Satisfaction"
              value={d.satisfaction == null ? "-" : d.satisfaction.toFixed(2)}
              definition={defs.satisfaction}
              hint={`/ 5 from ${formatNumber(d.feedback_count)}`}
            />
            <Figure label="Security alerts" value={formatNumber(d.security_alerts)} definition={defs.security_alerts} hint={`${formatNumber(d.open_security_events)} open`} />
            <Figure label="High risk" value={formatNumber(d.high_risk_events)} definition={defs.high_risk_events} hint="High or critical" />
          </div>
        </>
      )}
    </section>
  );
}

function ApprovalsCallout() {
  const { data: user } = useMe();
  const pending = usePendingApprovalsCount(can(user, "approvals:read"));
  if (!pending.data) return null;
  return (
    <Link
      href="/approvals"
      className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 transition-colors duration-150 hover:bg-warning/15"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning-text">
        <Hand aria-hidden className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          <span className="num">{pending.data}</span> approval{pending.data === 1 ? "" : "s"} waiting
        </span>
        <span className="text-sm text-muted-foreground">Held payments and refunds need a human decision.</span>
      </span>
      <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  );
}

function AnalystNote() {
  const s = useSnapshot();
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <AgentAvatar agentId="analyst" size="sm" /> Financial analyst
        </span>
      }
      description={s.data ? <>Latest analysis <TimeAgo date={s.data.created_at} />, trigger <span className="num">{s.data.trigger}</span></> : undefined}
      q={s}
      className="flex-1"
    >
      {s.data ? (
        <p className="text-sm leading-relaxed whitespace-pre-line">{s.data.narrative}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No analysis yet. It appears after the analyst agent runs.</p>
      )}
    </Panel>
  );
}

function RevenueAndFunnel() {
  const rev = useRevenue();
  const conv = useConversion();
  const funnel = conv.data?.funnel ?? [];
  const top = funnel[0]?.customers || 0;
  return (
    <>
      <ChartCard
        title="Revenue, last 30 days"
        description="Succeeded simulated payments per day, TND"
        loading={rev.isPending}
        error={rev.error}
        onRetry={() => rev.refetch()}
        height={240}
        className="min-w-0 lg:col-span-8"
      >
        {rev.data && <RevenueChart data={rev.data} />}
      </ChartCard>
      <Panel
        title="Conversion funnel"
        description={conv.data && `Overall ${formatPercent(conv.data.conversion_rate, { fromRatio: false })}`}
        q={conv}
        className="lg:col-span-4"
      >
        <BarList
          items={funnel.map((s) => ({
            key: s.stage,
            label: s.stage,
            value: s.customers,
            display: `${formatNumber(s.customers)}${top ? ` · ${formatPercent(s.customers / top, { digits: 0 })}` : ""}`,
          }))}
        />
      </Panel>
    </>
  );
}

function AgentStrip() {
  const agents = useQuery({ queryKey: qk.agents, queryFn: () => api.get<AgentView[]>("/agents") });
  const list = SIX.map((id) => agents.data?.find((a) => a.id === id)).filter((a): a is AgentView => !!a);
  return (
    <section aria-label="Agents" className="min-w-0 rounded-xl border bg-card p-5 lg:col-span-12">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agents</h2>
        <MoreLink href="/agents">All agents</MoreLink>
      </div>
      {agents.error ? (
        <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
      ) : agents.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x">
          {list.map((a) => (
            <li key={a.id}>
              <Link
                href={`/agents/${a.id}`}
                className="flex items-center gap-3 rounded-lg p-2.5 transition-colors duration-150 hover:bg-muted xl:px-3"
              >
                <AgentAvatar agentId={a.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={a.name}>
                    {AGENT_META[a.id]?.name ?? a.name}
                  </span>
                  <StatusBadge status={a.enabled ? a.status : "DISABLED"} className="mt-1" />
                  <span className="num mt-1 block text-xs whitespace-nowrap text-muted-foreground">
                    {a.stats.succeeded} ok · {a.stats.failed} failed
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({ wide }: { wide: boolean }) {
  const { events, status } = useEvents();
  const recent = events.slice(0, 8);
  return (
    <Panel
      title="Recent activity"
      description={status === "live" ? "Live" : status === "polling" ? "Updating every few seconds" : "Offline, reconnecting"}
      actions={<MoreLink href="/activity">Live activity</MoreLink>}
      className={wide ? "lg:col-span-12" : "lg:col-span-7"}
    >
      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No agent activity yet. Events appear here as agents work.</p>
      ) : (
        <ol className="divide-y">
          {recent.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <AgentAvatar agentId={e.agent_id ?? "orchestrator"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.summary}</p>
                <p className="num text-xs text-muted-foreground">{e.type}</p>
              </div>
              <TimeAgo date={e.created_at} className="shrink-0 text-xs text-muted-foreground" />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function OpenAlerts() {
  const q = useQuery({
    queryKey: [...qk.security, "events", { status: "OPEN", page_size: 5 }],
    queryFn: () => api.get<Paged<SecurityEvent>>("/security/events", { query: { status: "OPEN", page_size: 5 } }),
  });
  return (
    <Panel
      title="Open security alerts"
      description={q.data && `${formatNumber(q.data.total)} open`}
      actions={<MoreLink href="/security">Security</MoreLink>}
      q={q}
    >
      {q.data?.items.length ? (
        <ul className="divide-y">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <SeverityBadge severity={e.severity} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label(e.event_type)}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
              </div>
              <TimeAgo date={e.created_at} className="shrink-0 text-xs text-muted-foreground" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">No open alerts.</p>
      )}
    </Panel>
  );
}

function LatestRecommendations() {
  const q = useRecommendations("ACTIVE", 3);
  return (
    <Panel title="Latest recommendations" actions={<MoreLink href="/strategy">Strategy</MoreLink>} q={q}>
      {q.data?.items.length ? (
        <ul className="divide-y">
          {q.data.items.slice(0, 3).map((r) => (
            <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {label(r.category)} · {label(r.priority)} priority · confidence <span className="num">{confidencePct(r.confidence)}</span>
                {r.requires_approval && " · requires approval"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">No active recommendations.</p>
      )}
    </Panel>
  );
}

function PaymentsAndObjections() {
  const o = useOverview();
  const defs = useDefinitions();
  const p = o.data?.payments ?? {};
  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            Payment status <SimulatedBadge />
          </span>
        }
        actions={<MoreLink href="/payments">Payments</MoreLink>}
        q={o}
        className="lg:col-span-5"
      >
        <BarList
          items={PAYMENT_STATUSES.filter((s) => p[s as keyof typeof p] !== undefined).map((s) => ({
            key: s,
            label: <StatusBadge status={s} />,
            value: p[s as keyof typeof p] ?? 0,
          }))}
        />
      </Panel>
      <Panel
        title="Top objections"
        description={defs.objections}
        q={o}
        className="lg:col-span-7"
      >
        <BarList
          items={(o.data?.top_objections ?? []).map((x) => {
            const name = String(x.objection ?? x.label ?? "");
            const share = typeof x.share === "number" ? x.share : null;
            return {
              key: name,
              label: label(name),
              value: x.count,
              display: `${x.count}${share !== null ? ` · ${formatPercent(share, { fromRatio: false, digits: 0 })}` : ""}`,
            };
          })}
        />
      </Panel>
    </>
  );
}

function TrustAndOutlook() {
  const o = useOverview();
  const fb = useFeedback();
  const fc = useForecast();
  const types = Object.entries(o.data?.security_event_types ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Panel
        title="Suspicious event types"
        description="Detected by the Security & Fraud agent (rules and statistics)"
        actions={<MoreLink href="/security">Security</MoreLink>}
        q={o}
        className="lg:col-span-5"
      >
        <BarList
          color="var(--chart-4)"
          items={types.map(([k, v]) => ({ key: k, label: label(k), value: v }))}
          empty="No suspicious events"
        />
      </Panel>
      <Panel
        title="Customer feedback"
        description={fb.data ? `${formatNumber(fb.data.count)} reviews after purchase` : undefined}
        q={fb}
        className="lg:col-span-4"
      >
        {fb.data && (
          <div className="space-y-3">
            <p>
              <span className="num text-3xl font-semibold">{fb.data.average ?? "n/a"}</span>
              <span className="text-sm text-muted-foreground"> / 5 average</span>
            </p>
            <BarList
              items={["5", "4", "3", "2", "1"].map((r) => ({ key: r, label: `${r} stars`, value: fb.data.distribution[r] ?? 0 }))}
            />
            {fb.data.themes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Themes in critical comments: {fb.data.themes.map((t) => `${label(t.theme)} (${t.count})`).join(", ")}
              </p>
            )}
          </div>
        )}
      </Panel>
      <Panel
        title="Revenue forecast"
        description="Next 7 days, linear trend model"
        q={fc}
        className="lg:col-span-3"
      >
        {fc.data && (
          <div className="space-y-2">
            {fc.data.points.length ? (
              <>
                <p className="num text-2xl font-semibold">
                  <Money value={fc.data.total} currency="TND" />
                </p>
                <p className="text-xs text-muted-foreground">
                  Fit R² <span className="num">{fc.data.r2 ?? "n/a"}</span> on {fc.data.history_days} days of history.
                </p>
              </>
            ) : null}
            <p className="text-xs text-muted-foreground">{fc.data.note}</p>
          </div>
        )}
      </Panel>
    </>
  );
}
