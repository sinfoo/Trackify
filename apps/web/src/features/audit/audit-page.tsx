"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Link2, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, PageHeader, TimeAgo } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AuditLog, AuditVerify, Paged } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ALL, Actor, JsonView, Notice, errorText, unAll } from "@/features/security/shared";
import { AuditSeverity, OutcomeBadge } from "./audit-trail";

const PAGE_SIZE = 25;
const ACTOR_TYPES = ["user", "agent", "system", "customer"];
const SEVERITIES = ["INFO", "WARN", "CRITICAL"];
const TEXT_FILTERS = ["actor_id", "action", "date_from", "date_to"] as const;

function Hash({ value, label }: { value?: string | null; label: string }) {
  if (!value) return <span className="text-muted-foreground">{label === "prev" ? "Not returned by the API" : "-"}</span>;
  return (
    <span className="num text-xs break-all" title={value}>
      {value.slice(0, 16)}...{value.slice(-8)}
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

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL || (k === "page" && v === "1")) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const s = next.toString();
    router.replace(s ? `/audit?${s}` : "/audit", { scroll: false });
  };

  const q = useQuery({
    queryKey: ["audit", "logs", filters, page],
    queryFn: () => api.get<Paged<AuditLog>>("/audit/logs", { query: { ...filters, page, page_size: PAGE_SIZE } }),
    placeholderData: (prev) => prev,
  });

  const verify = useMutation({ mutationFn: () => api.get<AuditVerify>("/audit/verify") });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every action by users, agents and the system, chained with SHA-256 so tampering is detectable."
        actions={
          <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
            <Link2 aria-hidden /> {verify.isPending ? "Verifying..." : "Verify integrity"}
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <Notice icon={Lock} tone="neutral" title="Read-only. Records cannot be edited or deleted.">
          The API exposes no update or delete route, and each record stores the hash of the one before it.
        </Notice>
        <div aria-live="polite">
          {verify.data &&
            (verify.data.ok ? (
              <Notice icon={ShieldCheck} tone="success" title="Chain intact">
                Every record&apos;s hash was recomputed and matches its predecessor. No record has been altered or removed.
              </Notice>
            ) : (
              <Notice icon={ShieldX} tone="danger" title={`Chain broken at record #${verify.data.first_broken_id}`}>
                This record or one before it was modified outside the application. Treat the log after this point as untrusted.
              </Notice>
            ))}
          {verify.error && (
            <Notice tone="danger" title="Verification failed">
              {errorText(verify.error)}
            </Notice>
          )}
        </div>
      </div>

      <form
        key={params.toString()}
        className="mb-4 grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 md:grid-cols-3 xl:grid-cols-7 xl:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setParams(Object.fromEntries(TEXT_FILTERS.map((k) => [k, String(fd.get(k) ?? "").trim() || undefined])));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="f-actor-type">Actor type</Label>
          <Select value={filters.actor_type ?? ALL} onValueChange={(v) => setParams({ actor_type: v })}>
            <SelectTrigger id="f-actor-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              {ACTOR_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-severity">Severity</Label>
          <Select value={filters.severity ?? ALL} onValueChange={(v) => setParams({ severity: v })}>
            <SelectTrigger id="f-severity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-actor">Actor ID</Label>
          <Input id="f-actor" name="actor_id" defaultValue={filters.actor_id} placeholder="agent:payment" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-action">Action starts with</Label>
          <Input id="f-action" name="action" defaultValue={filters.action} placeholder="approval." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from">From</Label>
          <Input id="f-from" name="date_from" type="date" defaultValue={filters.date_from} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">To</Label>
          <Input id="f-to" name="date_to" type="date" defaultValue={filters.date_to} />
        </div>
        <div className="col-span-2 flex gap-2 md:col-span-3 xl:col-span-1">
          <Button type="submit" variant="secondary" className="flex-1">
            Apply
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={() => router.replace("/audit", { scroll: false })}>
              Clear
            </Button>
          )}
        </div>
      </form>

      {q.error && !q.isLoading ? (
        <ErrorState error={q.error} title="Could not load the audit log" onRetry={() => q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState title="No records match" description="Adjust or clear the filters." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Resource</TableHead>
                <TableHead className="hidden sm:table-cell">Outcome</TableHead>
                <TableHead className="hidden sm:table-cell">Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-busy={q.isFetching || undefined}>
              {q.isLoading
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }, (_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full max-w-32" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : q.data?.items.map((l) => {
                    const isOpen = open === l.id;
                    return (
                      <Fragment key={l.id}>
                        <TableRow className={cn(isOpen && "bg-muted/40")}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={isOpen}
                              aria-controls={`audit-${l.id}`}
                              aria-label={`${isOpen ? "Hide" : "Show"} details for record ${l.id}`}
                              onClick={() => setOpen(isOpen ? null : l.id)}
                            >
                              <ChevronDown aria-hidden className={cn("transition-transform", isOpen && "rotate-180")} />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <TimeAgo date={l.created_at} className="text-sm" />
                            <div className="num text-xs text-muted-foreground">#{l.id}</div>
                          </TableCell>
                          <TableCell>
                            <Actor type={l.actor_type} id={l.actor_id} />
                          </TableCell>
                          <TableCell className="num text-xs font-medium">{l.action}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {l.resource_type ? (
                              <span className="text-sm">
                                {l.resource_type}
                                {l.resource_id && <span className="num block max-w-40 truncate text-xs text-muted-foreground" title={l.resource_id}>{l.resource_id}</span>}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <OutcomeBadge outcome={l.outcome} />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <AuditSeverity severity={l.severity} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow id={`audit-${l.id}`} className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={7} className="whitespace-normal">
                              <div className="grid gap-4 py-2 lg:grid-cols-[1fr_22rem]">
                                <div>
                                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Details</p>
                                  <JsonView value={l.details} />
                                </div>
                                <dl className="space-y-2 text-sm">
                                  <div className="sm:hidden">
                                    <dt className="text-xs text-muted-foreground">Outcome / severity</dt>
                                    <dd className="mt-1 flex gap-2">
                                      <OutcomeBadge outcome={l.outcome} /> <AuditSeverity severity={l.severity} />
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-muted-foreground">Timestamp (UTC source)</dt>
                                    <dd className="num text-xs">{formatDateTime(l.created_at)}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-muted-foreground">IP</dt>
                                    <dd className="num text-xs">{l.ip ?? "-"}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-muted-foreground">Hash</dt>
                                    <dd><Hash value={l.hash} label="hash" /></dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-muted-foreground">Previous hash</dt>
                                    <dd><Hash value={l.prev_hash} label="prev" /></dd>
                                  </div>
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
          {q.data && (
            <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
              <span className="num">
                Page {page} of {pages} · {q.data.total} records
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
