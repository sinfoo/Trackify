"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState, SeverityBadge, StatusBadge, TimeAgo, humanize } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { AuditLog, Paged } from "@/lib/types";
import { Actor } from "@/features/security/shared";

export const AUDIT_SEVERITY: Record<string, string> = { INFO: "LOW", WARN: "MEDIUM", CRITICAL: "CRITICAL" };

/** Audit severity uses INFO/WARN/CRITICAL; map onto the shared badge (icon + text) but keep the audit word. */
export function AuditSeverity({ severity }: { severity: string }) {
  return <SeverityBadge severity={AUDIT_SEVERITY[severity] ?? severity} label={humanize(severity || "INFO")} />;
}

const OUTCOME_STATUS = { SUCCESS: "SUCCEEDED", DENIED: "BLOCKED" };

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = (outcome ?? "").toUpperCase();
  const status = (OUTCOME_STATUS as Record<string, string>)[o] ?? o;
  return <StatusBadge status={status} label={humanize(o || "UNKNOWN")} />;
}

/** Compact audit history for one resource (security event, approval). */
export function AuditTrail({ resourceType, resourceId }: { resourceType: string; resourceId: string }) {
  const q = useQuery({
    queryKey: ["audit", "trail", resourceType, resourceId],
    queryFn: () =>
      api.get<Paged<AuditLog>>("/audit/logs", { query: { resource_type: resourceType, resource_id: resourceId, page_size: 50 } }),
  });
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.error) return <ErrorState error={q.error} title="Could not load the audit trail" onRetry={() => q.refetch()} />;
  const items = q.data?.items ?? [];
  if (!items.length) return <p className="text-sm text-muted-foreground">No audit records for this item yet.</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((l) => (
        <li key={l.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="num text-xs font-medium">{l.action}</span>
            <TimeAgo date={l.created_at} className="text-xs text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Actor type={l.actor_type} id={l.actor_id} />
            <OutcomeBadge outcome={l.outcome} />
            {l.severity !== "INFO" && <AuditSeverity severity={l.severity} />}
          </div>
          {typeof l.details?.note === "string" && l.details.note && <p className="mt-1.5 text-muted-foreground">{l.details.note}</p>}
        </li>
      ))}
    </ol>
  );
}
