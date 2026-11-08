"use client";

import type { ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui-kit";
import { formatMoney, formatNumber } from "@/lib/format";
import type { RevenuePoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SecurityPoint } from "./api";

// Prototype palette: revenue = brand amber, forecast = info blue (dashed), failed = danger,
// severity = info / warning / danger with HIGH+CRITICAL merged (two reds were indistinguishable).

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const fmtDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const AXIS = { fill: "var(--t4)", fontSize: 11 };
const axisProps = { tickLine: false, axisLine: false, tick: AXIS } as const;
const GRID = { vertical: false, stroke: "var(--chart-grid)", strokeDasharray: "3 4" } as const;

function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-hair bg-panel px-3 py-2 text-[13px] text-text shadow-lift">
      <p className="mb-1 font-bold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: r.color }} />}
          <span className="text-t3">{r.label}</span>
          <span className="num ml-auto pl-4">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-t3">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span aria-hidden className="h-[3px] w-3.5 rounded-[2px]" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Daily simulated revenue (brand area) with an optional dashed forecast tail (info).
 * Money stays a string for display; Number() only drives geometry.
 */
export function RevenueChart({ data, forecast = [] }: { data: RevenuePoint[]; forecast?: { date: string; revenue: string }[] }) {
  const last = data.at(-1);
  const rows: { date: string; value?: number; fc?: number; p?: RevenuePoint }[] = data.map((d) => ({ date: d.date, value: Number(d.revenue), p: d }));
  if (last && forecast.length) {
    rows[rows.length - 1].fc = Number(last.revenue);
    for (const f of forecast) rows.push({ date: f.date, fc: Number(f.revenue) });
  }
  if (!rows.some((r) => (r.value ?? 0) > 0 || (r.fc ?? 0) > 0)) return <EmptyState title="No revenue in this period" className="h-full" />;
  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F5A623" stopOpacity=".3" />
              <stop offset="1" stopColor="#F5A623" stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
          <YAxis width={40} tickFormatter={(v: number) => compact.format(v)} {...axisProps} />
          <Tooltip
            cursor={{ stroke: "var(--t4)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !r) return null;
              return (
                <TipBox
                  title={fmtDay(r.date)}
                  rows={
                    r.p
                      ? [
                          { label: "Revenue", value: formatMoney(r.p.revenue), color: "var(--brand)" },
                          { label: "Succeeded", value: r.p.succeeded },
                          { label: "Failed", value: r.p.failed },
                        ]
                      : [{ label: "Forecast", value: formatMoney(String(r.fc ?? 0)), color: "var(--info)" }]
                  }
                />
              );
            }}
          />
          <Area type="monotone" dataKey="value" name="Revenue" stroke="var(--brand)" strokeWidth={2.5} fill="url(#gRev)" connectNulls={false} activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2 }} />
          <Line type="monotone" dataKey="fc" name="Forecast" stroke="var(--info)" strokeWidth={2.5} strokeDasharray="6 5" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <SrTable caption="Daily revenue" head={["Date", "Revenue", "Succeeded", "Failed"]} rows={data.map((d) => [d.date, formatMoney(d.revenue), d.succeeded, d.failed])} />
    </>
  );
}

/** Succeeded vs failed payments per day, stacked columns. */
export function PaymentOutcomeChart({ data }: { data: RevenuePoint[] }) {
  if (!data.some((d) => d.succeeded || d.failed)) return <EmptyState title="No payments in this period" className="h-full" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisProps} />
        <YAxis width={28} allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ fill: "var(--panel3)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as RevenuePoint | undefined;
            if (!active || !p) return null;
            return (
              <TipBox
                title={fmtDay(p.date)}
                rows={[
                  { label: "Succeeded", value: p.succeeded, color: "var(--success)" },
                  { label: "Failed", value: p.failed, color: "var(--danger)" },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="succeeded" stackId="a" fill="var(--success)" maxBarSize={24} stroke="var(--panel)" strokeWidth={1} />
        <Bar dataKey="failed" stackId="a" fill="var(--danger)" maxBarSize={24} radius={[4, 4, 0, 0]} stroke="var(--panel)" strokeWidth={1} />
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
          <CartesianGrid {...GRID} />
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={24} {...axisProps} />
          <YAxis width={28} allowDecimals={false} {...axisProps} />
          <Tooltip
            cursor={{ fill: "var(--panel3)" }}
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
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="sev" fill={s.color} maxBarSize={24} stroke="var(--panel)" strokeWidth={1} radius={i === SEVERITY_SERIES.length - 1 ? [4, 4, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <SrTable caption="Security events by day and severity" head={["Date", "Low", "Medium", "High", "Critical"]} rows={data.map((d) => [d.date, d.LOW, d.MEDIUM, d.HIGH, d.CRITICAL])} />
    </>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Prototype "Payments by status": 124px donut (recharts) with a centre figure, legend list to the right. */
export function Donut({ slices, centre, caption, size = 124 }: { slices: DonutSlice[]; centre: ReactNode; caption: string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const data = total ? slices.filter((s) => s.value > 0) : [{ key: "none", label: "No data", value: 1, color: "var(--panel3)" }];
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={size / 2 - 18} outerRadius={size / 2} startAngle={90} endAngle={-270} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
              {data.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            {total > 0 && (
              <Tooltip
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as DonutSlice | undefined;
                  if (!active || !p) return null;
                  return <TipBox title={p.label} rows={[{ label: "Count", value: p.value, color: p.color }]} />;
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center leading-[1.1]">
          <span>
            <span className="block text-[22px] font-extrabold">{centre}</span>
            <span className="block text-[10.5px] font-bold text-t3">{caption}</span>
          </span>
        </div>
      </div>
      <ul className="grid flex-1 gap-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[13px]">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-1 font-semibold">{s.label}</span>
            <span className="num text-t3">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text at the bar tip; defaults to the formatted value. */
  display?: ReactNode;
  /** Per-row bar colour (agent performance rows). */
  color?: string;
}

/**
 * Prototype ranked bars: 130px label (13/700), bar in --panel2 (8px, or `thick` 22px brand gradient), mono value right.
 * Readable without hover.
 */
export function BarList({
  items,
  color = "var(--c-intelligence)",
  max,
  empty = "No data in this period",
  thick,
  labelWidth = 130,
  valueWidth = 60,
  className,
}: {
  items: BarItem[];
  color?: string;
  max?: number;
  empty?: string;
  thick?: boolean;
  labelWidth?: number;
  valueWidth?: number;
  className?: string;
}) {
  if (!items.length || items.every((i) => !i.value)) return <p className="py-6 text-center text-[13px] text-t3">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("grid gap-2.5", className)}>
      {items.map((i) => (
        <li key={i.key} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `minmax(0,${labelWidth}px) 1fr ${valueWidth}px` }}>
          <span className="truncate font-bold">{i.label}</span>
          <span className={cn("overflow-hidden bg-panel2", thick ? "h-[22px] rounded-[7px]" : "h-2 rounded-[4px]")} aria-hidden>
            <span
              className={cn("block h-full transition-[width] duration-600 [transition-timing-function:cubic-bezier(.2,.8,.2,1)]", thick ? "rounded-[7px]" : "rounded-[4px]")}
              style={{ width: `${Math.max((i.value / top) * 100, i.value ? 2 : 0)}%`, background: thick ? "linear-gradient(90deg,var(--brand),#FFC65C)" : i.color ?? color }}
            />
          </span>
          <span className="num text-right text-xs text-t3">{i.display ?? formatNumber(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Thin two-part bar: succeeded (success) vs failed (danger). */
export function SplitBar({ ok, failed, label }: { ok: number; failed: number; label: string }) {
  const total = ok + failed;
  return (
    <span role="img" aria-label={label} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-panel2">
      {total > 0 && (
        <>
          <span className="h-full rounded-full" style={{ width: `${(ok / total) * 100}%`, background: "var(--success)" }} />
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
