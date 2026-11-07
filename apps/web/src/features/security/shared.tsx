"use client";

import type { ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { AgentAvatar } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Pretty-printed JSON, mono, scrollable. Read-only by construction. */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  const empty = value == null || (typeof value === "object" && Object.keys(value as object).length === 0);
  if (empty) return <p className="text-sm text-muted-foreground">No data recorded.</p>;
  return (
    <pre
      tabIndex={0}
      aria-label="JSON data"
      className={cn(
        "num max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Risk score in [0,1]: mono value + level word + small meter. Level text means color is never the only signal. */
export function RiskScore({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  const v = Math.max(0, Math.min(1, value));
  const level = v >= 0.6 ? "High" : v >= 0.3 ? "Medium" : "Low";
  const tone = v >= 0.6 ? "bg-danger" : v >= 0.3 ? "bg-warning" : "bg-info";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="num font-medium">{v.toFixed(2)}</span>
      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(4, v * 100)}%` }} />
      </span>
      <span className="text-xs text-muted-foreground">{level}</span>
    </span>
  );
}

/** Bordered callout. Full tinted border, never a side stripe (DESIGN.md ban). */
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
  const toneCls = {
    info: "border-info/25 bg-info/5 [&>svg]:text-info-text",
    warning: "border-warning/35 bg-warning/8 [&>svg]:text-warning-text",
    danger: "border-danger/30 bg-danger/5 [&>svg]:text-danger-text",
    success: "border-success/30 bg-success/5 [&>svg]:text-success-text",
    neutral: "border-border bg-muted/40 [&>svg]:text-muted-foreground",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", toneCls, className)}>
      <Icon aria-hidden className="mt-0.5 size-4.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** Label/value grid for detail panels. */
export function DetailList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** "agent:payment" -> avatar + name; "user:a@b" / emails -> mono text. */
export function Actor({ type, id }: { type?: string | null; id: string | null | undefined }) {
  if (!id) return <span className="text-muted-foreground">{type ?? "-"}</span>;
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
