"use client";

// Small building blocks shared by the customers / products / orders / payments pages.

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Native <select> styled like the shadcn Input. */
export const selectClass =
  "h-9 rounded-xl border border-hair bg-input px-3 text-sm outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 aria-invalid:border-danger [&>option]:bg-panel [&>option]:text-text";

/** URL search params as filter state. Any change except `page` resets pagination. */
export function useUrlParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  return [sp, set] as const;
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>{children}</dl>;
}

export function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{children ?? "-"}</dd>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft aria-hidden className="size-4" /> {label}
    </Link>
  );
}

/** Risk score is 0..1 from the backend; >= 0.6 is the hold threshold (services/risk.py). */
export function riskBand(score: number | null | undefined) {
  if (score === null || score === undefined) return null;
  if (score >= 0.6) return { label: "High", icon: ShieldAlert, className: "bg-danger/12 text-danger-text border-danger/25" };
  if (score >= 0.3)
    return { label: "Medium", icon: ShieldQuestion, className: "bg-warning/15 text-warning-text border-warning/30" };
  return { label: "Low", icon: ShieldCheck, className: "bg-success/12 text-success-text border-success/25" };
}

export function RiskScore({ score }: { score: number | null | undefined }) {
  const band = riskBand(score);
  if (!band) return <span className="text-muted-foreground">-</span>;
  const Icon = band.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        band.className,
      )}
      title={`${band.label} risk`}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="num">{score!.toFixed(2)}</span>
      <span>{band.label}</span>
    </span>
  );
}

/** Field-level messages from the backend 422 envelope: details.errors[{loc:["body","price"],msg}]. */
export function serverFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(err instanceof ApiError)) return out;
  const errors = (err.details?.errors as { loc?: unknown[]; msg?: string }[] | undefined) ?? [];
  for (const e of errors) {
    const field = e.loc?.[e.loc.length - 1];
    if (typeof field === "string" && e.msg) out[field] = e.msg.replace(/^Value error, /, "");
    else if (typeof field === "number" && e.loc && typeof e.loc[e.loc.length - 2] === "string")
      out[e.loc[e.loc.length - 2] as string] = e.msg ?? "Invalid value";
  }
  return out;
}

export function errorText(err: unknown) {
  if (err instanceof ApiError) return err.status === 403 ? "Your role does not have access to this." : err.message;
  return err instanceof Error ? err.message : "Something went wrong.";
}

export interface TimelineItem {
  key: string;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  at: string | null | undefined;
}

export function Timeline({ items, empty = "No events yet." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-4">
      {items.map((it) => (
        <li key={it.key} className="relative pl-6">
          <span aria-hidden className="absolute top-1.5 left-0 size-2.5 rounded-full border-2 border-info bg-card" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {it.title}
            <time dateTime={it.at ?? undefined} className="num text-xs text-muted-foreground">
              {formatDateTime(it.at)}
            </time>
          </div>
          {it.meta && <div className="mt-1 text-sm text-muted-foreground">{it.meta}</div>}
          {it.body && <div className="mt-1 text-sm">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-danger-text">
      {message}
    </p>
  );
}
