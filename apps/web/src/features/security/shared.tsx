"use client";

import type { CSSProperties, ReactNode } from "react";
import { Info, Lock, type LucideIcon } from "lucide-react";
import { AgentAvatar, BackLink, EmptyState, Eyebrow, PageTitle, RiskBar, TONE_CLASS, TonePill, type Tone } from "@/components/ui-kit";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Pretty-printed JSON, mono, scrollable. Read-only by construction. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const empty = value == null || (typeof value === "object" && Object.keys(value as object).length === 0);
  if (empty) return <p className="text-[13px] text-t3">No data recorded.</p>;
  return (
    <pre
      tabIndex={0}
      aria-label="JSON data"
      className={cn("num max-h-80 overflow-auto rounded-xl border border-hair bg-panel2 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap text-t2", className)}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Risk score in [0,1] rendered with the ui-kit RiskBar (0-100). */
export function RiskScore({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className="text-t3">-</span>;
  return <RiskBar score={Math.round(Math.max(0, Math.min(1, value)) * 100)} width={48} className={className} />;
}

/** Prototype notice bar: radius 18, 14px 16px, tone tint + tone border, "Title. " bold then text. */
export function Notice({
  icon: Icon = Info,
  tone = "info",
  title,
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "info" | "warning" | "danger" | "success" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const style: CSSProperties =
    tone === "neutral"
      ? { background: "var(--panel2)", borderColor: "var(--hair)", color: "var(--text)" }
      : { background: `var(--${tone}-bg)`, borderColor: `var(--${tone})`, color: `var(--${tone})` };
  return (
    <div className={cn("flex items-start gap-3 rounded-[18px] border px-4 py-3.5", className)} style={style}>
      <Icon aria-hidden className="mt-px size-[18px] shrink-0" strokeWidth={2.2} />
      <p className="text-[13.5px] leading-[1.5]">
        {title && <span className="font-extrabold">{title} </span>}
        {children}
      </p>
    </div>
  );
}

/** Prototype facts list: dt 13 --t3 / dd 13.5 600 right-aligned, hairline between rows. */
export function DetailList({ items, className }: { items: [ReactNode, ReactNode, boolean?][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-[18px]", className)}>
      {items.map(([k, v, mono], i) => (
        <div key={i} className="contents">
          <dt className="border-t border-hair py-[9px] text-[13px] text-t3">{k}</dt>
          <dd className={cn("min-w-0 border-t border-hair py-[9px] text-right text-[13.5px] font-semibold tabular [overflow-wrap:anywhere]", mono && "font-mono")}>
            {v ?? "-"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Prototype card: radius 22, --panel, hairline, 18px 20px padding, eyebrow title + optional mono count. */
export function Panel({
  title,
  count,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {count !== undefined && <span className="num text-xs text-t3">{count}</span>}
        {actions}
      </div>
      <div className={cn("mt-2.5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** One row of a detail "section" list: 32px tile, 13.5/700 title + optional pill, 12.5 sub, mono time. */
export function DetailItem({
  tile,
  title,
  pill,
  sub,
  time,
  mono,
}: {
  /** Agent id (coloured tile) or a `{icon, tone}` pair. */
  tile: string | { icon: LucideIcon; tone: Tone };
  title: ReactNode;
  pill?: { label: string; tone: Tone; icon?: LucideIcon };
  sub?: ReactNode;
  time?: ReactNode;
  mono?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 border-t border-hair py-[11px]">
      {typeof tile === "string" ? (
        <AgentAvatar agentId={tile} size={32} />
      ) : (
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", TONE_CLASS[tile.tone])}>
          <tile.icon aria-hidden className="size-[15px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-bold">{title}</span>
          {pill && <TonePill tone={pill.tone} icon={pill.icon} label={pill.label} size="default" weight={800} className="h-[22px] text-[11px]" />}
        </span>
        {sub && <span className={cn("mt-[3px] block text-[12.5px] leading-[1.45] text-t3 [overflow-wrap:anywhere]", mono && "font-mono")}>{sub}</span>}
      </span>
      {time && <span className="num shrink-0 text-[11px] whitespace-nowrap text-t3">{time}</span>}
    </li>
  );
}

/**
 * Prototype detail page: back link, 56px tile + eyebrow + 26px title + status pill + meta, actions right,
 * optional notice bar, then an auto-fit grid of cards (facts first).
 */
export function DetailPage({
  back,
  backLabel,
  tile,
  eyebrow,
  title,
  pill,
  meta = [],
  actions,
  notice,
  children,
}: {
  back: string;
  backLabel: string;
  tile: { icon?: LucideIcon; initials?: string; color: string; bg: string };
  eyebrow: ReactNode;
  title: ReactNode;
  pill?: ReactNode;
  meta?: { text: ReactNode; mono?: boolean }[];
  actions?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  const Icon = tile.icon;
  return (
    <div className="anim-rise flex flex-col gap-[18px]">
      <BackLink href={back}>{backLabel}</BackLink>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-[18px] text-lg font-extrabold" style={{ background: tile.bg, color: tile.color }}>
            {Icon ? <Icon aria-hidden className="size-[26px]" strokeWidth={2} /> : tile.initials}
          </span>
          <div className="min-w-0">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-0.5 text-[26px] leading-[1.15] font-extrabold tracking-[-0.025em]">{title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {pill}
              {meta.map((m, i) => (
                <span key={i} className={cn("text-[13px] text-t3", m.mono && "font-mono")}>
                  {m.text}
                </span>
              ))}
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {notice}
      <div className="grid items-start gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">{children}</div>
    </div>
  );
}

/** Page shell used by every step-7 list page: 28px title block + 18px gaps + rise. */
export function Page({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("anim-rise flex flex-col gap-[18px]", className)}>
      <PageTitle title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

/** Prototype filter chip: 999 pill, 34px, hairline; selected = --text fill. Optional count at 70% opacity. */
export function Chip({ label, count, selected, onClick, className }: { label: ReactNode; count?: ReactNode; selected?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-[13px] text-[13px] font-bold whitespace-nowrap transition-all duration-200",
        selected ? "border-text bg-text text-bg" : "border-hair bg-panel text-t2 hover:bg-panel2",
        className,
      )}
    >
      {label}
      {count !== undefined && <span className="tabular opacity-70">{count}</span>}
    </button>
  );
}

/** "agent:payment" -> avatar + name; "user:a@b" / emails -> mono text. */
export function Actor({ type, id }: { type?: string | null; id: string | null | undefined }) {
  if (!id) return <span className="text-t3">{type ?? "-"}</span>;
  const agent = type === "agent" || id.startsWith("agent:") ? id.replace(/^agent:/, "") : null;
  if (agent) return <AgentAvatar agentId={agent} size="sm" showName />;
  return <span className="num text-xs break-all">{id.replace(/^user:/, "")}</span>;
}

export function errorText(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError) return err.status === 403 && err.code.startsWith("HTTP_") ? "Your role is not allowed to do this." : err.message;
  return err instanceof Error ? err.message : fallback;
}

/** Radix Select cannot hold "" values; use this sentinel for "any". */
export const ALL = "all";
export const unAll = (v: string | null | undefined) => (!v || v === ALL ? undefined : v);

/** Page-level permission gate: a clear "no access" state instead of zeroed KPIs and 403 errors. UI only, the API enforces. */
export function PageGuard({ perm, title, children }: { perm: string; title: string; children: ReactNode }) {
  const { data: me, isPending } = useMe();
  if (isPending) return null;
  if (can(me, perm)) return <>{children}</>;
  return (
    <Page title={title}>
      <EmptyState icon={Lock} title="Your role cannot open this page" description={`It needs the ${perm} permission. Ask an administrator if you need access.`} />
    </Page>
  );
}
