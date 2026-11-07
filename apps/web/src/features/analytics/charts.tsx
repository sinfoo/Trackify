"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui-kit";
import { formatMoney, formatNumber } from "@/lib/format";
import type { RevenuePoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SecurityPoint } from "./api";

// Palette (validated with the dataviz validator against #FCFDFE light / #101D38 dark):
// single series -> chart-2 blue; succeeded/failed -> blue/red (green/red fails deutan CVD);
// severity -> info / warning / danger with HIGH+CRITICAL merged (two reds were indistinguishable).

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const AXIS = { fill: "var(--muted-foreground)", fontSize: 12 };
const axisProps = { tickLine: false, axisLine: false, tick: AXIS } as const;

function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span aria-hidden className="size-2.5 rounded-sm" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="num ml-auto pl-4">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Daily simulated revenue, one series. Money stays a string for display; Number() only drives geometry. */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const rows = data.map((d) => ({ ...d, value: Number(d.revenue) }));
  if (!rows.some((r) => r.value > 0)) return <EmptyState title="No revenue in this period" className="h-full" />;
  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisProps} />
          <YAxis width={44} tickFormatter={(v: number) => compact.format(v)} {...axisProps} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TipBox
                  title={fmtDay(p.date)}
                  rows={[
                    { label: "Revenue", value: formatMoney(p.revenue), color: "var(--chart-2)" },
                    { label: "Succeeded", value: p.succeeded },
                    { label: "Failed", value: p.failed },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="Revenue"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="var(--chart-2)"
            fillOpacity={0.1}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <SrTable
        caption="Daily revenue"
        head={["Date", "Revenue", "Succeeded", "Failed"]}
        rows={data.map((d) => [d.date, formatMoney(d.revenue), d.succeeded, d.failed])}
      />
    </>
  );
}

/** Succeeded vs failed payments per day, stacked columns. */
export function PaymentOutcomeChart({ data }: { data: RevenuePoint[] }) {
  if (!data.some((d) => d.succeeded || d.failed)) return <EmptyState title="No payments in this period" className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisProps} />
        <YAxis width={32} allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as RevenuePoint | undefined;
            if (!active || !p) return null;
            return (
              <TipBox
                title={fmtDay(p.date)}
                rows={[
                  { label: "Succeeded", value: p.succeeded, color: "var(--chart-2)" },
                  { label: "Failed", value: p.failed, color: "var(--danger)" },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="succeeded" stackId="a" fill="var(--chart-2)" maxBarSize={24} stroke="var(--card)" strokeWidth={1} />
        <Bar dataKey="failed" stackId="a" fill="var(--danger)" maxBarSize={24} radius={[4, 4, 0, 0]} stroke="var(--card)" strokeWidth={1} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export const SEVERITY_SERIES = [
  { key: "low", label: "Low", color: "var(--info)" },
  { key: "medium", label: "Medium", color: "var(--warning)" },
  { key: "high", label: "High or critical", color: "var(--danger)" },
] as const;

/** Security events per day stacked by severity. */
export function SecurityTrendChart({ data }: { data: SecurityPoint[] }) {
  const rows = data.map((d) => ({ date: d.date, low: d.LOW, medium: d.MEDIUM, high: d.HIGH + d.CRITICAL, critical: d.CRITICAL }));
  if (!rows.some((r) => r.low || r.medium || r.high)) return <EmptyState title="No security events in this period" className="h-full" />;
  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisProps} />
          <YAxis width={32} allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return (
                <TipBox
                  title={fmtDay(p.date)}
                  rows={[
                    { label: "Low", value: p.low, color: "var(--info)" },
                    { label: "Medium", value: p.medium, color: "var(--warning)" },
                    { label: "High", value: p.high - p.critical, color: "var(--danger)" },
                    { label: "Critical", value: p.critical, color: "var(--danger)" },
                  ]}
                />
              );
            }}
          />
          {SEVERITY_SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="sev"
              fill={s.color}
              maxBarSize={24}
              stroke="var(--card)"
              strokeWidth={1}
              radius={i === SEVERITY_SERIES.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <SrTable
        caption="Security events by day and severity"
        head={["Date", "Low", "Medium", "High", "Critical"]}
        rows={data.map((d) => [d.date, d.LOW, d.MEDIUM, d.HIGH, d.CRITICAL])}
      />
    </>
  );
}

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text at the bar tip; defaults to the formatted value. */
  display?: ReactNode;
}

/** Ranked horizontal bars in plain HTML: label, thin bar, value at the tip. Readable without hover. */
export function BarList({
  items,
  color = "var(--chart-2)",
  max,
  empty = "No data in this period",
  className,
}: {
  items: BarItem[];
  color?: string;
  max?: number;
  empty?: string;
  className?: string;
}) {
  if (!items.length || items.every((i) => !i.value)) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{i.label}</span>
          <span className="h-2 rounded-full bg-muted" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max((i.value / top) * 100, i.value ? 2 : 0)}%`, background: color }}
            />
          </span>
          <span className="num text-right text-muted-foreground">{i.display ?? formatNumber(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Thin two-part bar: succeeded (blue) vs failed (red). */
export function SplitBar({ ok, failed, label }: { ok: number; failed: number; label: string }) {
  const total = ok + failed;
  return (
    <span role="img" aria-label={label} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
      {total > 0 && (
        <>
          <span className="h-full rounded-full" style={{ width: `${(ok / total) * 100}%`, background: "var(--chart-2)" }} />
          {failed > 0 && <span className="h-full rounded-full" style={{ width: `${(failed / total) * 100}%`, background: "var(--danger)" }} />}
        </>
      )}
    </span>
  );
}

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
