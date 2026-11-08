"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, FlaskConical, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState } from "./states";
import { TONE_CLASS, type Tone } from "./status-badge";

/** Decimal-string money, mono + tabular. `<Money value="1290.000" />` -> 1,290.000 TND */
export function Money({
  value,
  currency = "TND",
  className,
  trim,
}: {
  value: string | number | null | undefined;
  currency?: string;
  className?: string;
  /** Customer-facing: drop ".000" on whole amounts. */
  trim?: boolean;
}) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(value, currency, { trim })}</span>;
}

/** Relative time that refreshes every 30s; full timestamp in the title and datetime attribute. */
export function TimeAgo({ date, className }: { date: string | null | undefined; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!date) return <span className={cn("text-t4", className)}>—</span>;
  return (
    <time dateTime={date} title={formatDateTime(date)} className={cn("whitespace-nowrap", className)} suppressHydrationWarning>
      {formatRelative(date)}
    </time>
  );
}

/** Header "Simulated" pill (prototype): 36px, --panel2 + hairline, flask icon, 12.5/600 --t2. */
export function SimulatedBadge({ className, label = "Simulated" }: { className?: string; label?: string }) {
  return (
    <span
      title="Payments are simulated; no real money moves."
      className={cn(
        "inline-flex h-9 items-center gap-[7px] rounded-full border border-hair bg-panel2 px-3 text-[12.5px] font-semibold whitespace-nowrap text-t2",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

/** 11.5px / 700 / uppercase / .08em / --t4 label. */
export function Eyebrow({ children, className, as: Tag = "p" }: { children: ReactNode; className?: string; as?: "p" | "span" | "h2" | "h3" }) {
  return <Tag className={cn("eyebrow", className)}>{children}</Tag>;
}

/** Page title block: 28/800 -0.025em + description (list pages). */
export function PageTitle({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="headline text-[28px] leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-[720px] text-t3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** "← All workflows" 13/700 --t3. */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 text-[13px] font-bold text-t3 no-underline hover:text-text hover:no-underline", className)}>
      <ArrowLeft aria-hidden className="size-3.5" />
      {children}
    </Link>
  );
}

/** Generic 999 pill. `tone` picks a status tint; default = --panel3 chip. `selected` = --text fill. */
export function Pill({
  children,
  tone,
  selected,
  mono,
  size = "default",
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: Tone;
  selected?: boolean;
  mono?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[11px]" : size === "lg" ? "h-8 px-3.5 text-[13px]" : "h-[22px] px-2.5 text-xs",
        tone ? TONE_CLASS[tone] : "bg-panel3 text-text",
        selected && "bg-text text-bg",
        mono && "font-mono font-semibold",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Coloured icon tile (needs-you pills, alert rows, settings). `tone` or explicit agent-style `color`/`bg`. */
export function Tile({
  icon: Icon,
  tone = "neutral",
  size = 32,
  radius,
  color,
  bg,
  round,
  className,
  iconSize,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  radius?: number;
  /** CSS colour overrides (e.g. `var(--c-sales)` / `var(--c-sales-bg)`). */
  color?: string;
  bg?: string;
  round?: boolean;
  className?: string;
  iconSize?: number;
}) {
  const r = round ? size / 2 : (radius ?? Math.round(size * 0.3));
  const ic = iconSize ?? Math.round(size * 0.47);
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", !color && TONE_CLASS[tone], className)}
      style={{ width: size, height: size, borderRadius: r, ...(color ? { color, background: bg } : {}) }}
    >
      <Icon style={{ width: ic, height: ic }} strokeWidth={2.2} />
    </span>
  );
}

/** Risk score 0-100 bar: <40 success, <70 warning, else danger. */
export function RiskBar({
  score,
  width = 56,
  showValue = true,
  className,
}: {
  score: number | null | undefined;
  width?: number;
  showValue?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const tone = v < 40 ? "var(--success)" : v < 70 ? "var(--warning)" : "var(--danger)";
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Risk ${v}`}>
      <span className="h-1.5 overflow-hidden rounded-full bg-panel3" style={{ width }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label="Risk score">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: tone }} />
      </span>
      {showValue && <span className="num text-xs font-bold" style={{ color: tone }}>{score == null ? "—" : v}</span>}
    </span>
  );
}

/**
 * Inline SVG sparkline (default 64x24, KPI delta row). Stroke 1.6, optional soft area fill.
 * `color` defaults to the brand amber; pass `var(--c-sales)` etc. for agent strips.
 */
export function Sparkline({
  data,
  width = 64,
  height = 24,
  color = "var(--brand)",
  area = true,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  className?: string;
}) {
  const gid = useId();
  if (!data || data.length < 2) return <span style={{ width, height }} className={cn("inline-block", className)} aria-hidden />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (width - pad * 2) + pad,
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const fill = `${line} L${(width - pad).toFixed(1)} ${height} L${pad} ${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

export function ChartCard({
  title,
  eyebrow,
  description,
  actions,
  loading,
  error,
  onRetry,
  height = 280,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Chart area height in px. Recharts ResponsiveContainer needs a sized parent. */
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[22px] border border-hair bg-panel p-5 shadow-card", className)} aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2 className="text-base font-extrabold tracking-[-0.01em]">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-t3">{description}</p>}
        </div>
        {actions}
      </div>
      <div style={{ height }}>
        {error && !loading ? (
          <ErrorState error={error} onRetry={onRetry} className="h-full" />
        ) : loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
