"use client";

import type { CSSProperties, ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackLink } from "./misc";
import { TONE_CLASS, type Tone } from "./status-badge";

/**
 * Prototype "generic detail" (Trackify.dc.html GENERIC DETAIL block):
 * back link · 56px tile + eyebrow/title 26/800 + badge/meta row · 40px actions · optional notice ·
 * 2 columns `1fr minmax(280px,360px)`: main sections (left) + facts aside (right).
 */
export function DetailPage({
  back,
  eyebrow,
  title,
  tile,
  badge,
  meta,
  actions,
  notice,
  aside,
  children,
  className,
}: {
  back: { href: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  /** 56px radius-18 tile: an icon or initials on a colour pair (agent colours or --panel3/--text). */
  tile?: { icon?: LucideIcon; initials?: string; color: string; bg: string };
  badge?: ReactNode;
  meta?: ReactNode[];
  actions?: ReactNode;
  notice?: ReactNode;
  /** Facts column (right). */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tile?.icon;
  return (
    <div className={cn("anim-rise flex flex-col gap-[18px]", className)}>
      <BackLink href={back.href}>{back.label}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {tile && (
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-[18px] text-lg font-extrabold"
              style={{ color: tile.color, background: tile.bg }}
            >
              {Icon ? <Icon className="size-[26px]" strokeWidth={2} /> : tile.initials}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className="headline mt-0.5 text-[26px] leading-[1.15]">{title}</h1>
            {(badge || meta?.length) && (
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {badge}
                {meta?.map((m, i) => (
                  <span key={i} className="text-[13px] text-t3">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {notice}
      <div className={cn("grid items-start gap-[18px]", aside && "lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]")}>
        <div className="flex min-w-0 flex-col gap-[18px]">{children}</div>
        {aside && <div className="flex min-w-0 flex-col gap-[18px]">{aside}</div>}
      </div>
    </div>
  );
}

/** Prototype detail notice: radius 18, tinted fill + border, 14px 16px, bold title then text. */
export function DetailNotice({
  icon: Icon,
  tone = "warning",
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  tone?: Exclude<Tone, "progress">;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const neutral = tone === "neutral";
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-[18px] border px-4 py-3.5",
        neutral ? "border-hair bg-panel2 text-text" : cn(TONE_CLASS[tone], "border-current/60"),
        className,
      )}
      style={neutral ? undefined : { borderColor: `var(--${tone})` }}
    >
      <Icon aria-hidden className="mt-px size-[18px] shrink-0" strokeWidth={2.2} />
      <p className="text-[13.5px] leading-normal">
        <span className="font-extrabold">{title} </span>
        {children}
      </p>
    </div>
  );
}

/** Detail card: radius 22, --panel, 18px 20px padding, eyebrow title + optional mono count on the right. */
export function DetailSection({
  title,
  count,
  actions,
  children,
  className,
  style,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section aria-label={typeof title === "string" ? title : undefined} className={cn("rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card", className)} style={style}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">{title}</p>
        {count !== undefined && count !== null ? <span className="num text-xs text-t3">{count}</span> : actions}
      </div>
      {children}
    </section>
  );
}

/** Facts `dl`: grid auto 1fr, rows with a top hairline, 9px padding, labels 13 --t3, values 13.5/600 right-aligned. */
export function Facts({ items, className }: { items: { k: ReactNode; v: ReactNode; mono?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("mt-2.5 grid grid-cols-[auto_1fr] gap-x-[18px]", className)}>
      {items.map((f, i) => (
        <div key={i} className="contents">
          <dt className="border-t border-hair py-[9px] text-[13px] text-t3">{f.k}</dt>
          <dd className={cn("min-w-0 border-t border-hair py-[9px] text-right text-[13.5px] font-semibold tabular [overflow-wrap:anywhere]", f.mono && "num")}>
            {f.v ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Mono chips under the facts (prototype `detail.chips`): 11.5px, radius 8, tinted or hairline. */
export function FactChips({ title, chips, className }: { title: ReactNode; chips: { label: string; color?: string; bg?: string; muted?: boolean }[]; className?: string }) {
  if (!chips.length) return null;
  return (
    <div className={className}>
      <p className="eyebrow mt-4">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className={cn("mono rounded-lg border px-[9px] py-1 text-[11.5px]", c.muted ? "border-hair text-t4 line-through" : "border-transparent")}
            style={c.muted ? undefined : { color: c.color ?? "var(--text)", background: c.bg ?? "var(--panel3)" }}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One row of a detail section list: 32px tile · title 13.5/700 + pill · sub 12.5 --t3 · mono time right. */
export function DetailItem({
  icon: Icon,
  color,
  bg,
  title,
  pill,
  sub,
  mono,
  time,
  actions,
  className,
}: {
  icon: LucideIcon;
  color: string;
  bg: string;
  title: ReactNode;
  pill?: ReactNode;
  sub?: ReactNode;
  /** Sub line in Geist Mono. */
  mono?: boolean;
  time?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex flex-wrap items-start gap-3 border-t border-hair py-[11px]", className)}>
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color, background: bg }}>
        <Icon className="size-[15px]" strokeWidth={2} />
      </span>
      <span className="min-w-[180px] flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-bold">{title}</span>
          {pill}
        </span>
        {sub && <span className={cn("mt-[3px] block text-[12.5px] leading-[1.45] text-t3 [overflow-wrap:anywhere]", mono && "mono")}>{sub}</span>}
      </span>
      {(actions || time) && (
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {actions}
          {time && <span className="num text-[11px] whitespace-nowrap text-t3">{time}</span>}
        </span>
      )}
    </li>
  );
}

/** `<ol>` wrapper for DetailItem rows (prototype adds the list 8px under the section title). */
export function DetailList({ children, empty, className }: { children: ReactNode; empty?: ReactNode; className?: string }) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : !!children;
  if (!hasChildren) return <p className="mt-2 text-[13px] text-t3">{empty ?? "Nothing yet."}</p>;
  return <ol className={cn("mt-2", className)}>{children}</ol>;
}
