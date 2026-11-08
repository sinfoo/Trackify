"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Clock, Hand, Info, Lightbulb, ShieldAlert, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as ChartTooltip, XAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentAvatar, agentColors, agentMeta, ErrorState, Eyebrow, humanize, Money, SeverityBadge, SimulatedBadge, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { api } from "@/lib/api";
import { AGENT_IDS, REV } from "@/lib/fixtures";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe, usePendingApprovalsCount } from "@/lib/queries";
import type { AgentView, Paged, SecurityEvent, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HandoffsPanel, OrchestrationCanvas } from "@/features/agents/orchestration-canvas";
import { useScenarioClock } from "@/features/agents/scenario-clock";
import { useConversion, useDefinitions, useFeedback, useForecast, useOverview, useRevenue, useSnapshot } from "@/features/analytics/api";
import { PAYMENT_STATUSES } from "@/features/analytics/analytics-view";
import { BarList, fmtDay } from "@/features/analytics/charts";
import { confidencePct, useRecommendations } from "@/features/strategy/strategy-view";

const label = (s: string) => humanize(String(s ?? "").toUpperCase());
// Short names so the bar list (10rem label column) never truncates on a projector.
const SHORT_EVENT: Record<string, string> = {
  AGENT_PERMISSION_VIOLATION: "Permission violation",
  HIGH_VALUE_TRANSACTION: "High value payment",
  POTENTIAL_DUPLICATE_TRANSACTION: "Possible duplicate",
  PROMPT_INJECTION_ATTEMPT: "Prompt injection",
  REPEATED_FAILED_PAYMENTS: "Repeated failures",
  SUSPICIOUS_PAYMENT_PATTERN: "Payment velocity",
};
// Hero is always dark (README): fixed on-dark colours, not theme tokens.
const ON_HERO = { dim: "rgba(243,245,249,.6)", dim2: "rgba(243,245,249,.5)", dim3: "rgba(243,245,249,.55)", text: "rgba(243,245,249,.7)" };
const GOOD = "#7CF3B6";
const BAD = "#FDA4AF";
const EASE = "cubic-bezier(.2,.8,.2,1)";
const rise = (dur: number, delay = 0): CSSProperties => ({ animation: `rise ${dur}s ${delay}s ${EASE} both` });

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
// Computed once at module load (lint: no impure calls during render). Stale only across midnight.
const NOW = Date.now();
/** Previous 30-day window (the API defaults to the last 30 days when no filter is given). */
const PREV_WINDOW = { date_from: isoDay(new Date(NOW - 60 * DAY)), date_to: isoDay(new Date(NOW - 30 * DAY)) };

const useOpenAlerts = (enabled: boolean) =>
  useQuery({
    queryKey: [...qk.security, "events", { status: "OPEN", page_size: 4 }],
    queryFn: () => api.get<Paged<SecurityEvent>>("/security/events", { query: { status: "OPEN", page_size: 4 } }),
    enabled,
  });
const useHeldPayments = (enabled: boolean) =>
  useQuery({
    queryKey: [...qk.payments, "held"],
    queryFn: () => api.get<Paged<Transaction>>("/payments/transactions", { query: { status: "REQUIRES_APPROVAL", page_size: 50 } }),
    enabled,
  });
const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => api.get<AgentView[]>("/agents") });

export function DashboardView() {
  const { data: user } = useMe();
  const canAnalytics = can(user, "analytics:read");
  const canSecurity = can(user, "security:read");
  const canStrategy = can(user, "strategy:read");
  const canApprovals = can(user, "approvals:read");

  return (
    <div className="flex flex-col gap-5">
      <Hero first={user?.full_name.split(" ")[0]} canAnalytics={canAnalytics} canSecurity={canSecurity} canStrategy={canStrategy} canApprovals={canApprovals} />

      <section className="flex flex-wrap gap-5" style={rise(0.55, 0.08)} aria-label="The team at work">
        <OrchestrationCanvas className="flex-[3_1_600px]" />
        <HandoffsPanel className="flex-[1_1_300px]" />
      </section>

      {canAnalytics && <RevenueAndFunnel />}

      <Roster />

      <section className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", ...rise(0.55, 0.22) }}>
        <RecentActivity />
        {canSecurity && <OpenAlerts />}
        {canStrategy && <LatestRecommendations />}
      </section>

      {canAnalytics && (
        <section className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", ...rise(0.55, 0.28) }}>
          <AnalystNote />
          <PaymentStatus />
          <TopObjections />
          <SuspiciousTypes />
          <CustomerFeedback />
          <RevenueForecast />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hero

function Hero({ first, canAnalytics, canSecurity, canStrategy, canApprovals }: { first?: string; canAnalytics: boolean; canSecurity: boolean; canStrategy: boolean; canApprovals: boolean }) {
  return (
    <section
      className="relative overflow-hidden rounded-[26px] border px-7 pt-[26px] pb-6 text-[#F3F5F9]"
      style={{ background: "linear-gradient(135deg,#0E1C3E 0%,#0A1530 55%,#0B1A3A 100%)", borderColor: "rgba(255,255,255,.07)", ...rise(0.5) }}
      aria-label="Overview"
    >
      <div aria-hidden className="pointer-events-none absolute -top-[260px] -left-40 size-[620px] rounded-full" style={{ background: "radial-gradient(circle,rgba(245,166,35,.22),rgba(245,166,35,.05) 50%,rgba(245,166,35,0) 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute -right-30 -bottom-60 size-[520px] rounded-full" style={{ background: "radial-gradient(circle,rgba(57,123,255,.18),rgba(57,123,255,0) 65%)" }} />

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.08em] uppercase" style={{ color: ON_HERO.dim }}>
            Overview
          </p>
          <h1 className="mt-1 text-[30px] leading-tight font-extrabold tracking-[-0.025em]">
            {greeting()}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1 text-sm" style={{ color: ON_HERO.text }}>
            Sales, payments, security and agent work at a glance.
          </p>
        </div>
        <SimulatedBadge label="Simulated payments, fictional data" className="border-white/12 bg-white/8 text-[#F3F5F9]" />
      </div>

      {canAnalytics && <HeroFigures />}

      <div className="relative mt-[22px] flex flex-wrap items-center gap-2.5">
        <span className="mr-1 text-[11.5px] font-extrabold tracking-[.08em] uppercase" style={{ color: ON_HERO.dim2 }}>
          Needs you
        </span>
        {canApprovals && <ApprovalsPill />}
        {canSecurity && <AlertsPill />}
        {canAnalytics && <PendingPaymentsPill />}
        {canStrategy && <RecommendationsPill />}
      </div>
    </section>
  );
}

const W = 600;
const H = 132;
const num = (v: string | number) => Number(v) || 0;

/** Revenue line + the four figure tiles (prototype hero). Numbers from /analytics/overview, deltas vs the previous 30 days. */
function HeroFigures() {
  const o = useOverview();
  const prev = useOverview(PREV_WINDOW);
  const rev = useRevenue();
  const prevRev = useRevenue(PREV_WINDOW);
  const held = useHeldPayments(true);
  const defs = useDefinitions();
  const d = o.data;

  // ponytail: REV fixture only when the API has no revenue at all (fresh database); PREV line only with real history.
  const apiRev = rev.data?.map((p) => num(p.revenue)) ?? [];
  const useFixture = rev.isSuccess && !apiRev.some((v) => v > 0);
  const series = useFixture ? REV : apiRev.length ? apiRev : REV;
  const prevSeries = prevRev.data?.map((p) => num(p.revenue)) ?? [];
  const hasPrev = prevSeries.some((v) => v > 0);
  const n = series.length;
  const max = Math.max(...series, ...(hasPrev ? prevSeries : []), 1);
  const pt = (v: number, i: number): [number, number] => [i * (W / (n - 1 || 1)), H - 8 - (v / max) * (H - 24)];
  const line = (arr: number[]) => arr.map((v, i) => { const [x, y] = pt(v, i); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const last = pt(series[n - 1], n - 1);
  const peakI = series.indexOf(Math.max(...series));
  const dates = useFixture || !rev.data?.length ? Array.from({ length: n }, (_, i) => isoDay(new Date(NOW - (n - 1 - i) * DAY))) : rev.data.map((p) => p.date);
  const ticks = [0, 7, 14, 21, n - 1].map((i) => dates[Math.min(i, n - 1)]);

  const prevRevenue = num(prev.data?.revenue ?? 0);
  const revDelta = d && prevRevenue > 0 ? ((num(d.revenue) - prevRevenue) / prevRevenue) * 100 : null;
  const convDelta = d && prev.data && prevRevenue > 0 ? d.conversion_rate - prev.data.conversion_rate : null;
  const intDelta = d && prev.data && prevRevenue > 0 ? d.interested_customers - prev.data.interested_customers : null;
  const heldTotal = held.data?.items.reduce((s, t) => s + num(t.amount), 0) ?? 0;
  const signed = (v: number, suffix = "", digits = 0) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;

  if (o.error) return <ErrorState error={o.error} onRetry={() => o.refetch()} className="relative mt-5 text-text" />;

  return (
    <div className="relative mt-5 grid items-end gap-7" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))" }}>
      <div>
        <p className="text-xs font-bold tracking-[.08em] uppercase" style={{ color: ON_HERO.dim }}>
          Simulated revenue · 30 days
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
          {d ? (
            <span className="tabular text-[46px] leading-none font-extrabold tracking-[-0.035em]">{formatMoney(d.revenue, "", { trim: true })}</span>
          ) : (
            <Skeleton className="h-[46px] w-44 bg-white/10" />
          )}
          <span className="text-[17px] font-semibold" style={{ color: ON_HERO.dim }}>
            TND
          </span>
          {revDelta !== null && (
            <span
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-extrabold"
              style={{ background: revDelta >= 0 ? "rgba(61,203,139,.18)" : "rgba(251,113,133,.18)", color: revDelta >= 0 ? GOOD : BAD }}
            >
              {revDelta >= 0 ? <TrendingUp aria-hidden className="size-[13px]" strokeWidth={2.4} /> : <TrendingDown aria-hidden className="size-[13px]" strokeWidth={2.4} />}
              {signed(revDelta, "%")}
            </span>
          )}
          <span className="text-[12.5px]" style={{ color: ON_HERO.dim }}>
            {revDelta !== null ? "vs previous 30 days" : "no previous period to compare"}
          </span>
        </div>
        <div className="relative mt-[18px]" style={{ height: H }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label="Daily simulated revenue, last 30 days">
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFC65C" stopOpacity=".32" />
                <stop offset="1" stopColor="#FFC65C" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="rgba(255,255,255,.08)" strokeDasharray="3 4">
              <line x1="0" y1="20" x2={W} y2="20" />
              <line x1="0" y1="66" x2={W} y2="66" />
              <line x1="0" y1="112" x2={W} y2="112" />
            </g>
            {hasPrev && <path d={line(prevSeries)} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
            <path d={`${line(series)} L${last[0].toFixed(1)},${H} L0,${H} Z`} fill="url(#gRev)" />
            <path d={line(series)} fill="none" stroke="#FFC65C" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <line x1={last[0].toFixed(1)} y1={last[1].toFixed(1)} x2={last[0].toFixed(1)} y2={H} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="4.5" fill="#FFC65C" stroke="#0A1530" strokeWidth="2" />
          </svg>
          <span
            className="absolute -top-1.5 rounded-[7px] bg-[#F3F5F9] px-[7px] py-[3px] text-[10.5px] font-extrabold whitespace-nowrap text-[#0B1730]"
            style={{ left: `${((peakI / (n - 1 || 1)) * 100).toFixed(1)}%`, transform: "translate(-50%,-100%)" }}
          >
            {formatMoney(series[peakI], "TND", { trim: true })}
          </span>
        </div>
        <div className="mt-2 flex justify-between text-[11px]" style={{ color: ON_HERO.dim2 }}>
          {ticks.map((t, i) => (
            <span key={i}>{fmtDay(t)}</span>
          ))}
        </div>
        <div className="mt-2.5 flex gap-4 text-xs" style={{ color: ON_HERO.dim }}>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-[2.5px] w-3.5 rounded-xs bg-[#FFC65C]" />
            This period
          </span>
          {hasPrev && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0 w-3.5 border-t-[1.5px] border-dashed border-white/40" />
              Previous
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Fig href="/analytics" label="Conversion" value={d && formatPercent(d.conversion_rate, { fromRatio: false }).replace("%", "")} unit="%" definition={defs.conversion_rate}
          delta={convDelta === null ? undefined : { text: signed(convDelta, " pts", 1), icon: convDelta >= 0 ? ArrowUpRight : ArrowDownRight, color: convDelta >= 0 ? GOOD : BAD }}
          hint={d && `${formatNumber(d.enrollments)} enrollments`} />
        <Fig href="/customers" label="Interested" value={d && formatNumber(d.interested_customers)} definition={defs.interested_customers}
          delta={intDelta === null ? undefined : { text: signed(intDelta), icon: intDelta >= 0 ? ArrowUpRight : ArrowDownRight, color: intDelta >= 0 ? GOOD : BAD }}
          hint={d && `of ${formatNumber(d.customers_engaged)} engaged`} />
        <Fig href="/approvals" label="Held payments" value={d && formatNumber(d.payments.REQUIRES_APPROVAL ?? 0)} definition={defs.pending_payments}
          delta={heldTotal > 0 ? { text: formatMoney(heldTotal, "TND", { trim: true }), icon: Hand, color: "#FFC65C" } : undefined} hint="awaiting a human" />
        <Fig href="/security" label="Security alerts" value={d && formatNumber(d.open_security_events)} unit="open" definition={defs.security_alerts}
          delta={d ? { text: `${formatNumber(d.high_risk_events)} high`, icon: TriangleAlert, color: BAD } : undefined} hint={d && `of ${formatNumber(d.security_alerts)} total`} />
      </div>
    </div>
  );
}

function Fig({ href, label, value, unit, definition, delta, hint }: { href: string; label: string; value?: ReactNode; unit?: string; definition?: string; delta?: { text: string; icon: LucideIcon; color: string }; hint?: ReactNode }) {
  const D = delta?.icon;
  return (
    <Link
      href={href}
      className="rounded-[18px] border border-white/8 bg-white/6 px-4 py-3.5 text-inherit no-underline transition-[background,transform] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-0.5 hover:bg-white/10 hover:no-underline"
    >
      <p className="flex items-center gap-1 text-[11.5px] font-bold tracking-[.06em] uppercase" style={{ color: ON_HERO.dim3 }}>
        {label}
        {definition && (
          <Tooltip>
            <TooltipTrigger aria-label={`Definition of ${label}`} className="rounded-xs hover:text-[#F3F5F9]">
              <Info aria-hidden className="size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{definition}</TooltipContent>
          </Tooltip>
        )}
      </p>
      <div className="tabular mt-1.5 text-[26px] leading-none font-extrabold tracking-[-0.03em]">
        {value ?? <Skeleton className="inline-block h-6 w-16 bg-white/10 align-middle" />}
        {unit && (
          <span className="ml-1 text-[13px] font-semibold" style={{ color: ON_HERO.dim3 }}>
            {unit}
          </span>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: delta?.color ?? ON_HERO.dim2 }}>
        {D && <D aria-hidden className="size-3" strokeWidth={2.4} />}
        {delta?.text}
        <span className="ml-0.5 font-medium" style={{ color: ON_HERO.dim2 }}>
          {hint}
        </span>
      </p>
    </Link>
  );
}

function NeedPill({ href, icon: Icon, count, label, tile, fg, urgent }: { href: string; icon: LucideIcon; count: number | undefined; label: string; tile: string; fg: string; urgent?: boolean }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[42px] items-center gap-2.5 rounded-full border border-white/12 bg-white/8 pr-3.5 pl-1.5 text-[#F3F5F9] no-underline transition-[background,transform] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px hover:bg-white/14 hover:no-underline"
    >
      <span className="relative grid size-[30px] place-items-center rounded-full" style={{ background: tile, color: fg }}>
        <Icon aria-hidden className="size-[15px]" strokeWidth={2.2} />
        {urgent && !!count && <span aria-hidden className="absolute -top-px -right-px size-[9px] rounded-full border-2 border-[#0C1838] bg-brand" />}
      </span>
      <span className="tabular text-[15px] font-extrabold">{count ?? <Skeleton className="inline-block h-4 w-4 bg-white/10 align-middle" />}</span>
      <span className="text-[12.5px]" style={{ color: ON_HERO.text }}>
        {label}
      </span>
    </Link>
  );
}
function ApprovalsPill() {
  const q = usePendingApprovalsCount(true);
  return <NeedPill href="/approvals" icon={Hand} count={q.data} label={q.data === 1 ? "approval to decide" : "approvals to decide"} tile="rgba(245,166,35,.25)" fg="#FFC65C" urgent />;
}
function AlertsPill() {
  const q = useOpenAlerts(true);
  return <NeedPill href="/security" icon={ShieldAlert} count={q.data?.total} label={q.data?.total === 1 ? "open alert" : "open alerts"} tile="rgba(251,113,133,.22)" fg="#FDA4AF" urgent />;
}
function PendingPaymentsPill() {
  const o = useOverview();
  const p = o.data?.payments;
  const count = p ? (p.PENDING ?? 0) + (p.PROCESSING ?? 0) + (p.CREATED ?? 0) : undefined;
  return <NeedPill href="/payments" icon={Clock} count={count} label={count === 1 ? "payment pending" : "payments pending"} tile="rgba(57,123,255,.22)" fg="#8FB4FF" />;
}
function RecommendationsPill() {
  const q = useRecommendations("ACTIVE", 3);
  return <NeedPill href="/strategy" icon={Lightbulb} count={q.data?.total} label={q.data?.total === 1 ? "new recommendation" : "new recommendations"} tile="rgba(250,204,21,.18)" fg="#FDE68A" />;
}

// ---------------------------------------------------------------- shared card

type QueryLike = { isPending: boolean; error: unknown; refetch: () => unknown };

/** Prototype card: radius 22, --panel, hairline, 20px padding, eyebrow + 16/800 title, 12.5/700 link. */
function Card({ eyebrow, title, link, q, children, className, style }: { eyebrow: string; title: ReactNode; link?: { href: string; label: string }; q?: QueryLike; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cn("min-w-0 rounded-[22px] border border-hair bg-panel p-5 shadow-card", className)} style={style} aria-label={typeof title === "string" ? title : eyebrow}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-0.5 text-base font-extrabold">{title}</h2>
        </div>
        {link && (
          <Link href={link.href} className="shrink-0 text-[12.5px] font-bold text-brand-text">
            {link.label} →
          </Link>
        )}
      </div>
      <div className="mt-3">
        {q?.error && !q.isPending ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q?.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-4 text-center text-sm text-t3">{children}</p>;

// ---------------------------------------------------------------- revenue + funnel (README §1.3)

function RevenueAndFunnel() {
  const rev = useRevenue();
  const conv = useConversion();
  const rows = (rev.data ?? []).map((p) => ({ ...p, value: num(p.revenue) }));
  const funnel = conv.data?.funnel ?? [];
  const top = funnel[0]?.customers || 0;
  return (
    <section className="flex flex-wrap gap-5" style={rise(0.55, 0.12)} aria-label="Revenue and conversion">
      <Card eyebrow="Analyst agent" title="Revenue, last 30 days" link={{ href: "/analytics", label: "Analytics" }} q={rev} className="flex-[2_1_420px]">
        {rows.some((r) => r.value > 0) ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
                <XAxis dataKey="date" interval={4} padding={{ left: 14, right: 14 }} tickFormatter={fmtDay} tickLine={false} axisLine={false} tick={{ fill: "var(--t3)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <ChartTooltip
                  cursor={{ fill: "var(--panel2)" }}
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                    if (!active || !p) return null;
                    return (
                      <div className="rounded-xl border border-hair bg-panel px-3 py-2 text-sm shadow-lift">
                        <p className="font-bold">{fmtDay(p.date)}</p>
                        <p className="num text-t2">{formatMoney(p.revenue)}</p>
                        <p className="text-xs text-t3">
                          {p.succeeded} succeeded · {p.failed} failed
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" name="Revenue" radius={4} maxBarSize={18}>
                  {rows.map((r, i) => (
                    <Cell key={r.date} fill={i === rows.length - 1 ? "var(--brand)" : "rgba(245,166,35,.35)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty>No revenue in this period</Empty>
        )}
      </Card>
      <Card eyebrow="Customer journey" title="Conversion funnel" link={{ href: "/analytics", label: "Analytics" }} q={conv} className="flex-[1_1_300px]">
        {funnel.length ? (
          <ol className="space-y-3.5">
            {funnel.map((s) => (
              <li key={s.stage}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-semibold">{s.stage}</span>
                  <span className="num text-t3">
                    {formatNumber(s.customers)}
                    {top ? ` · ${formatPercent(s.customers / top, { digits: 0 })}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-panel3">
                  <span className="block h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${top ? (s.customers / top) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
            {conv.data && (
              <li className="pt-1 text-xs text-t3">
                Overall conversion <span className="num font-bold text-text">{formatPercent(conv.data.conversion_rate, { fromRatio: false })}</span>
              </li>
            )}
          </ol>
        ) : (
          <Empty>No funnel data yet</Empty>
        )}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------- agents strip

// ponytail: the API has no per-run history; prototype sparkline bars until /analytics/agents grows a series.
const SPARK: Record<string, number[]> = {
  sales: [40, 70, 55, 90, 60, 80, 45, 100],
  intelligence: [30, 50, 70, 60, 90, 40, 80, 65],
  payment: [20, 40, 30, 60, 80, 50, 100, 70],
  analyst: [50, 50, 60, 70, 65, 80, 90, 85],
  strategy: [20, 30, 20, 40, 30, 50, 40, 60],
  security: [60, 80, 70, 90, 100, 85, 95, 90],
};

function Roster() {
  const agents = useAgents();
  const { current } = useScenarioClock();
  const active = new Set([current.from, current.to]);
  return (
    <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", ...rise(0.55, 0.16) }} aria-label="Agents">
      {agents.error ? (
        <ErrorState error={agents.error} onRetry={() => agents.refetch()} className="col-span-full" />
      ) : (
        AGENT_IDS.map((id) => {
          const a = agents.data?.find((x) => x.id === id);
          const m = agentMeta(id);
          const { color: fg, background: tile } = agentColors(id);
          const Icon = m.icon;
          const running = active.has(id) || a?.status === "RUNNING";
          const stateColor = running ? "var(--success)" : "var(--t4)";
          return (
            <Link
              key={id}
              href={`/agents/${id}`}
              className="flex flex-col gap-3 rounded-[20px] border bg-panel p-4 text-inherit no-underline transition-[transform,border-color,box-shadow] duration-250 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[3px] hover:shadow-lift hover:no-underline"
              style={{ borderColor: running ? fg : "var(--hair)", boxShadow: running ? `0 0 0 3px ${tile}` : "var(--shadow)" }}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-[13px]" style={{ background: tile, color: fg }}>
                  <Icon aria-hidden className="size-[19px]" strokeWidth={2} />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: stateColor }}>
                  <span aria-hidden className="size-[7px] rounded-full" style={{ background: stateColor }} />
                  {a && !a.enabled ? "Disabled" : running ? "Running" : "Idle"}
                </span>
              </div>
              <div>
                <p className="text-[14.5px] font-extrabold tracking-[-0.01em]">{m.name}</p>
                <p className="mt-0.5 text-xs text-t3">{m.full}</p>
              </div>
              <div className="flex items-end justify-between">
                <span className="tabular text-xl font-extrabold tracking-[-0.02em]">
                  {a ? formatNumber(a.stats.succeeded + a.stats.failed) : <Skeleton className="inline-block h-5 w-8 align-middle" />}
                  <span className="ml-1 text-[11.5px] font-semibold text-t3">runs</span>
                </span>
                <span className="flex h-[22px] items-end gap-0.5" aria-hidden>
                  {(SPARK[id] ?? []).map((s, i) => (
                    <span key={i} className="w-1 rounded-xs opacity-70" style={{ height: `${s}%`, background: fg }} />
                  ))}
                </span>
              </div>
              {a && (
                <span className="num sr-only">
                  {a.stats.succeeded} ok · {a.stats.failed} failed
                </span>
              )}
            </Link>
          );
        })
      )}
    </section>
  );
}

// ---------------------------------------------------------------- recent / alerts / recommendations

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function RecentActivity() {
  const { events, status } = useEvents();
  const recent = events.slice(0, 6);
  return (
    <Card eyebrow={status === "live" ? "Recent · live" : status === "polling" ? "Recent · polling" : "Recent · offline"} title="Activity" link={{ href: "/activity", label: "All activity" }}>
      {recent.length === 0 ? (
        <Empty>No agent activity yet. Events appear here as agents work.</Empty>
      ) : (
        <ol>
          {recent.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 border-t border-hair py-[9px]">
              <AgentAvatar agentId={e.agent_id ?? "orchestrator"} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-text">{e.summary}</span>
                <span className="block font-mono text-[11px] text-t3">{e.type}</span>
              </span>
              <time dateTime={e.created_at} className="font-mono text-[11px] whitespace-nowrap text-t3" suppressHydrationWarning>
                {clock.format(new Date(e.created_at))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function OpenAlerts() {
  const q = useOpenAlerts(true);
  return (
    <Card eyebrow="Trust" title="Open alerts" link={{ href: "/security", label: "Security" }} q={q}>
      {q.data?.items.length ? (
        <ul>
          {q.data.items.map((e) => (
            <li key={e.id} className="border-t border-hair">
              <Link href={`/security/${e.id}`} className="flex items-start gap-2.5 py-2.5 text-inherit no-underline hover:no-underline">
                <SeverityBadge severity={e.severity} className="h-[22px] px-2 text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">{label(e.event_type)}</span>
                  <span className="block truncate text-xs text-t3">{e.description}</span>
                </span>
                <TimeAgo date={e.created_at} className="text-[11px] text-t3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No open alerts.</Empty>
      )}
    </Card>
  );
}

function LatestRecommendations() {
  const q = useRecommendations("ACTIVE", 3);
  return (
    <Card eyebrow="Strategy agent" title="Recommendations" link={{ href: "/strategy", label: "Strategy" }} q={q}>
      {q.data?.items.length ? (
        <ul>
          {q.data.items.slice(0, 3).map((r) => {
            const pct = Math.round(r.confidence > 1 ? r.confidence : r.confidence * 100);
            return (
              <li key={r.id} className="border-t border-hair py-2.5">
                <p className="text-[13.5px] leading-[1.3] font-bold">{r.title}</p>
                <p className="mt-1 flex items-center gap-2 text-[11.5px] text-t3">
                  <span className="rounded-md bg-panel2 px-[7px] py-px font-bold">{label(r.category)}</span>
                  <span>{label(r.priority)} priority</span>
                  {r.requires_approval && <span>· needs approval</span>}
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <span className="h-1 w-11 overflow-hidden rounded-xs bg-panel3" aria-hidden>
                      <span className="block h-full bg-brand" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="num" title="Confidence">{confidencePct(r.confidence)}</span>
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>No active recommendations.</Empty>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- extra panels (not in the prototype; kept from the previous dashboard)

function AnalystNote() {
  const s = useSnapshot();
  return (
    <Card
      eyebrow="Analyst agent"
      title={
        <span className="flex items-center gap-2">
          <AgentAvatar agentId="analyst" size={24} /> Financial analyst
        </span>
      }
      link={{ href: "/analytics", label: "Analytics" }}
      q={s}
    >
      {s.data ? (
        <>
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-t2">{s.data.narrative}</p>
          <p className="mt-2 text-xs text-t3">
            Latest analysis <TimeAgo date={s.data.created_at} />, trigger <span className="num">{s.data.trigger}</span>
          </p>
        </>
      ) : (
        <Empty>No analysis yet. It appears after the analyst agent runs.</Empty>
      )}
    </Card>
  );
}

function PaymentStatus() {
  const o = useOverview();
  const p = o.data?.payments ?? {};
  return (
    <Card eyebrow="Payment agent · simulated" title="Payment status" link={{ href: "/payments", label: "Payments" }} q={o}>
      <BarList
        color="var(--brand)"
        items={PAYMENT_STATUSES.filter((s) => p[s as keyof typeof p] !== undefined).map((s) => ({ key: s, label: <StatusBadge status={s} />, value: p[s as keyof typeof p] ?? 0 }))}
      />
    </Card>
  );
}

function TopObjections() {
  const o = useOverview();
  const defs = useDefinitions();
  return (
    <Card eyebrow="Intelligence agent" title={<span title={defs.objections}>Top objections</span>} link={{ href: "/strategy", label: "Strategy" }} q={o}>
      <BarList
        color="var(--c-intelligence)"
        items={(o.data?.top_objections ?? []).map((x) => {
          const name = String(x.objection ?? x.label ?? "");
          const share = typeof x.share === "number" ? x.share : null;
          return { key: name, label: label(name), value: x.count, display: `${x.count}${share !== null ? ` · ${formatPercent(share, { fromRatio: false, digits: 0 })}` : ""}` };
        })}
      />
    </Card>
  );
}

function SuspiciousTypes() {
  const o = useOverview();
  const types = Object.entries(o.data?.security_event_types ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <Card eyebrow="Security agent" title="Suspicious event types" link={{ href: "/security", label: "Security" }} q={o}>
      <BarList color="var(--c-security)" items={types.map(([k, v]) => ({ key: k, label: SHORT_EVENT[k] ?? label(k), value: v }))} empty="No suspicious events" />
    </Card>
  );
}

function CustomerFeedback() {
  const fb = useFeedback();
  return (
    <Card eyebrow="After purchase" title="Customer feedback" q={fb}>
      {fb.data && (
        <div className="space-y-3">
          <p>
            <span className="tabular text-[26px] font-extrabold tracking-[-0.02em]">{fb.data.average ?? "n/a"}</span>
            <span className="text-sm text-t3"> / 5 from {formatNumber(fb.data.count)} reviews</span>
          </p>
          <BarList color="var(--brand)" items={["5", "4", "3", "2", "1"].map((r) => ({ key: r, label: r === "1" ? "1 star" : `${r} stars`, value: fb.data.distribution[r] ?? 0 }))} />
          {fb.data.themes.length > 0 && <p className="text-xs text-t3">Themes in critical comments: {fb.data.themes.map((t) => `${label(t.theme)} (${t.count})`).join(", ")}</p>}
        </div>
      )}
    </Card>
  );
}

function RevenueForecast() {
  const fc = useForecast();
  return (
    <Card eyebrow="Analyst agent · next 7 days" title="Revenue forecast" q={fc}>
      {fc.data && (
        <div className="space-y-2">
          {fc.data.points.length > 0 && (
            <>
              <p className="tabular text-[26px] font-extrabold tracking-[-0.02em]">
                <Money value={fc.data.total} currency="TND" className="font-sans" />
              </p>
              <p className="text-xs text-t3">
                Linear trend, fit R² <span className="num">{fc.data.r2 ?? "n/a"}</span> on {fc.data.history_days} days of history.
              </p>
            </>
          )}
          <p className="text-xs text-t3">{fc.data.note}</p>
        </div>
      )}
    </Card>
  );
}
