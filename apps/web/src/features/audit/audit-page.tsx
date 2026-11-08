"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, ChevronDown, Copy, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailNotice, EmptyState, ErrorState, PageTitle } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { AuditLog, AuditVerify, Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ALL, JsonView, unAll } from "@/features/security/shared";
import { ActorCell, Clock, FilterChip, FilterSelect, ListPage, SearchBox, Toolbar, actionBtn, errorText, selectClass, tight, useDebouncedSearch } from "@/features/payments/shared";
import { AuditSeverity, OutcomeBadge } from "./audit-trail";

const PAGE_SIZE = 25;
const ACTOR_TYPES: [string, string][] = [
  ["user", "Humans"],
  ["agent", "Agents"],
  ["system", "System"],
  ["customer", "Customers"],
];
const SEVERITIES = ["INFO", "WARN", "CRITICAL"];

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/** Mono --t4 hash with a copy button (prototype "Chain" column). */
function HashCell({ value, label = "hash" }: { value?: string | null; label?: string }) {
  if (!value) return <span className="text-t4">{label === "prev" ? "not returned by the API" : "—"}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="num text-[11.5px] font-medium text-t4" title={value}>
        {short(value)}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="grid size-6 place-items-center rounded-md text-t4 hover:bg-panel3 hover:text-text focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(value).then(() => toast.success("Hash copied"));
        }}
      >
        <Copy aria-hidden className="size-3" />
      </button>
    </span>
  );
}

/** One-line summary from what the API gives (there is no summary column): note, resource, outcome, severity. */
function Summary({ l }: { l: AuditLog }) {
  const note = typeof l.details?.note === "string" ? l.details.note : typeof l.details?.reason === "string" ? l.details.reason : null;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
      <span className="truncate text-[13.5px] font-medium">
        {note ?? (l.resource_type ? `${l.resource_type}${l.resource_id ? " " : ""}` : "—")}
        {!note && l.resource_id && <span className="num text-t3">{l.resource_id.slice(0, 8)}</span>}
      </span>
      {l.outcome && l.outcome.toUpperCase() !== "SUCCESS" && <OutcomeBadge outcome={l.outcome} />}
      {l.severity !== "INFO" && <AuditSeverity severity={l.severity} />}
    </span>
  );
}

export function AuditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState<number | null>(null);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filters = {
    actor_type: unAll(params.get("actor_type")),
    severity: unAll(params.get("severity")),
    actor_id: params.get("actor_id") ?? undefined,
    action: params.get("action") ?? undefined,
    date_from: params.get("date_from") ?? undefined,
    date_to: params.get("date_to") ?? undefined,
  };

  const setParams = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL || (k === "page" && v === "1")) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const s = next.toString();
    router.replace(s ? `/audit?${s}` : "/audit", { scroll: false });
  };
  const [action, setAction] = useDebouncedSearch(filters.action ?? "", (v) => setParams({ action: v }));
  const [actor, setActor] = useDebouncedSearch(filters.actor_id ?? "", (v) => setParams({ actor_id: v }));

  const q = useQuery({
    queryKey: ["audit", "logs", filters, page],
    queryFn: () => api.get<Paged<AuditLog>>("/audit/logs", { query: { ...filters, page, page_size: PAGE_SIZE } }),
    placeholderData: (prev) => prev,
  });

  const verify = useMutation({
    mutationFn: () => api.get<AuditVerify>("/audit/verify"),
    onSuccess: (r) => (r.ok ? toast.success(`Chain verified: ${formatNumber(q.data?.total)} rows intact`) : toast.error(`Chain broken at record #${r.first_broken_id}`)),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const hasFilters = Object.values(filters).some(Boolean);
  const shown = q.data?.items.length ?? 0;
  const from = shown ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <ListPage>
      <PageTitle
        title="Audit"
        description="Tamper-evident log of every agent action, payment event and human decision. Each row is chained to the previous hash."
        actions={
          <Button variant="outline" className={actionBtn} onClick={() => verify.mutate()} disabled={verify.isPending}>
            <BadgeCheck aria-hidden /> {verify.isPending ? "Verifying…" : "Verify integrity"}
          </Button>
        }
      />
      <div className="grid gap-3" aria-live="polite">
        <DetailNotice icon={Lock} tone="neutral" title="Read-only.">
          Records cannot be edited or deleted: the API exposes no update or delete route, and each record stores the hash of the one before it.
        </DetailNotice>
        {verify.data &&
          (verify.data.ok ? (
            <DetailNotice icon={ShieldCheck} tone="success" title="Chain intact.">
              Every record&apos;s hash was recomputed and matches its predecessor. No record has been altered or removed.
            </DetailNotice>
          ) : (
            <DetailNotice icon={ShieldX} tone="danger" title={`Chain broken at record #${verify.data.first_broken_id}.`}>
              This record or one before it was modified outside the application. Treat the log after this point as untrusted.
            </DetailNotice>
          ))}
        {verify.error && (
          <DetailNotice icon={ShieldX} tone="danger" title="Verification failed.">
            {errorText(verify.error)}
          </DetailNotice>
        )}
      </div>

      <Toolbar>
        <SearchBox value={action} onChange={setAction} placeholder="Search actions… (prefix, e.g. payment.)" label="Filter by action prefix" />
        <FilterChip selected={!filters.actor_type} onClick={() => setParams({ actor_type: null })} count={!filters.actor_type && q.data ? formatNumber(q.data.total) : undefined}>
          All
        </FilterChip>
        {ACTOR_TYPES.map(([v, l]) => (
          <FilterChip key={v} selected={filters.actor_type === v} onClick={() => setParams({ actor_type: v })} count={filters.actor_type === v && q.data ? formatNumber(q.data.total) : undefined}>
            {l}
          </FilterChip>
        ))}
        <FilterSelect label="Severity" value={filters.severity ?? ""} onChange={(v) => setParams({ severity: v || null })}>
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </FilterSelect>
        <input aria-label="Actor ID" placeholder="Actor, e.g. agent:payment" value={actor} onChange={(e) => setActor(e.target.value)} className={cn(selectClass, "w-[200px] placeholder:text-t4")} />
        <input aria-label="From date" type="date" value={filters.date_from ?? ""} onChange={(e) => setParams({ date_from: e.target.value || null })} className={cn(selectClass, "num")} />
        <input aria-label="To date" type="date" value={filters.date_to ?? ""} onChange={(e) => setParams({ date_to: e.target.value || null })} className={cn(selectClass, "num")} />
        {hasFilters && (
          <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={() => router.replace("/audit", { scroll: false })}>
            Clear
          </Button>
        )}
      </Toolbar>

      {q.error && !q.isLoading ? (
        <ErrorState error={q.error} title="Could not load the audit log" onRetry={() => q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState title="No records match" description="Change the filters or run a scenario from Demo control." />
      ) : (
        <div className="overflow-hidden rounded-[22px] border border-hair bg-panel shadow-card">
          <Table minWidth={900}>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(tight, "w-[90px]")}>Time</TableHead>
                <TableHead className={tight}>Actor</TableHead>
                <TableHead className={tight}>Action</TableHead>
                <TableHead className={tight}>Summary</TableHead>
                <TableHead className={cn(tight, "w-[150px]")}>Chain</TableHead>
                <TableHead className={cn(tight, "w-10")}>
                  <span className="sr-only">Expand</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-busy={q.isFetching || undefined}>
              {q.isLoading
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {Array.from({ length: 6 }, (_, j) => (
                        <TableCell key={j} className={tight}>
                          <Skeleton className="h-3.5 w-full" style={{ maxWidth: `${55 + ((i * 17 + j * 7) % 40)}%` }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : q.data?.items.map((l, i) => {
                    const isOpen = open === l.id;
                    const toggle = () => setOpen(isOpen ? null : l.id);
                    return (
                      <Fragment key={l.id}>
                        <TableRow
                          tabIndex={0}
                          aria-expanded={isOpen}
                          aria-controls={`audit-${l.id}`}
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggle();
                            }
                          }}
                          className={cn("anim-row-in cursor-pointer", isOpen && "bg-panel2")}
                          style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                        >
                          <TableCell className={tight}>
                            <Clock date={l.created_at} className="text-[12.5px] font-medium text-t3" />
                            <span className="num block text-[11px] text-t4">{formatDateTime(l.created_at).slice(0, 11)}</span>
                          </TableCell>
                          <TableCell className={tight}>
                            <ActorCell type={l.actor_type} id={l.actor_id} />
                          </TableCell>
                          <TableCell className={cn(tight, "num text-[12.5px] font-semibold")}>{l.action}</TableCell>
                          <TableCell className={cn(tight, "max-w-[320px] whitespace-normal")}>
                            <Summary l={l} />
                          </TableCell>
                          <TableCell className={tight}>
                            <HashCell value={l.hash} />
                          </TableCell>
                          <TableCell className={cn(tight, "text-right")}>
                            <ChevronDown aria-hidden className={cn("inline size-4 text-t4 transition-transform", isOpen && "rotate-180")} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow id={`audit-${l.id}`} className="bg-panel2 hover:bg-panel2">
                            <TableCell colSpan={6} className="whitespace-normal">
                              <div className="grid gap-4 py-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                                <div>
                                  <p className="eyebrow mb-2">Details</p>
                                  <JsonView value={l.details} className="border-hair bg-panel" />
                                </div>
                                <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] text-[13px]">
                                  {(
                                    [
                                      ["Record", <span key="r" className="num">#{l.id}</span>],
                                      ["Outcome", <span key="o" className="inline-flex flex-wrap justify-end gap-1.5"><OutcomeBadge outcome={l.outcome} /><AuditSeverity severity={l.severity} /></span>],
                                      ["Resource", l.resource_type ? <span key="t">{l.resource_type}{l.resource_id && <span className="num block text-xs text-t3">{l.resource_id}</span>}</span> : "—"],
                                      ["Timestamp", <span key="ts" className="num">{formatDateTime(l.created_at)}</span>],
                                      ["IP", <span key="ip" className="num">{l.ip ?? "—"}</span>],
                                      ["Hash", <HashCell key="h" value={l.hash} />],
                                      ["Previous hash", <HashCell key="p" value={l.prev_hash} label="prev" />],
                                    ] as [string, React.ReactNode][]
                                  ).map(([k, v]) => (
                                    <div key={k} className="contents">
                                      <dt className="border-t border-hair py-2 text-t3">{k}</dt>
                                      <dd className="min-w-0 border-t border-hair py-2 text-right font-semibold [overflow-wrap:anywhere]">{v}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 border-t border-hair px-5 py-3 text-[12.5px] text-t3">
            <span className="tabular">{q.data ? `Showing ${from}–${from + shown - 1} of ${formatNumber(q.data.total)} entries` : "Loading…"}</span>
            <span className="inline-flex gap-1.5">
              <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5 text-[12.5px] text-t2" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
                Previous
              </Button>
              <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5 text-[12.5px] text-t2" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </ListPage>
  );
}
