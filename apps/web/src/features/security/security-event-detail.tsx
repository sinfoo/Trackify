"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar, ErrorState, PageHeader, SeverityBadge, StatusBadge, TimeAgo, humanize } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Execution, SecurityEvent } from "@/lib/types";
import { AuditTrail } from "@/features/audit/audit-trail";
import { Detector } from "./security-page";
import { DetailList, JsonView, Notice, Panel, RiskScore, errorText } from "./shared";

const RESOLUTIONS = ["INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

export function SecurityEventDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [status, setStatus] = useState<Resolution>("RESOLVED");
  const [note, setNote] = useState("");
  const key = [...qk.security, "event", id];

  const q = useQuery({ queryKey: key, queryFn: () => api.get<SecurityEvent>(`/security/events/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.security });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const resolve = useMutation({
    mutationFn: () => api.post<SecurityEvent>(`/security/events/${id}/resolve`, { status, note: note.trim() }),
    onSuccess: (ev) => {
      qc.setQueryData(key, ev);
      toast.success(`Event marked ${humanize(ev.status).toLowerCase()}`);
      setNote("");
    },
    onSettled: refresh,
  });

  const explain = useMutation({
    mutationFn: () =>
      api.post<Execution>("/agents/security/execute", { task_type: "explain", payload: { security_event_id: id } }),
    onSuccess: (ex) => {
      if (ex.status === "FAILED") toast.error(ex.error ?? "The security agent could not explain this event.");
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => {
      q.refetch();
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
      <Link href="/security">
        <ArrowLeft aria-hidden /> All security events
      </Link>
    </Button>
  );

  if (q.isLoading)
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-9 w-80" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </>
    );
  if (q.error || !q.data)
    return (
      <>
        {back}
        <ErrorState error={q.error} title="Could not load this security event" onRetry={() => q.refetch()} />
      </>
    );

  const e = q.data;
  const canWrite = can(me, "security:write");
  const canExplain = can(me, "agents:write");

  return (
    <>
      {back}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {humanize(e.event_type)} <SeverityBadge severity={e.severity} /> <StatusBadge status={e.status} />
          </span>
        }
        description={e.description}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Investigation">
            <DetailList
              items={[
                ["Category", humanize(e.category)],
                ["Detector", <Detector key="d" value={e.detector} />],
                ["Risk score", <RiskScore key="r" value={e.risk_score} />],
                [
                  "Recommended action",
                  e.recommended_action ? <span className="font-medium">{humanize(e.recommended_action)}</span> : "None",
                ],
                ["Detected", <span key="t">{formatDateTime(e.created_at)} (<TimeAgo date={e.created_at} />)</span>],
                ["Agent", e.agent_id ? <AgentAvatar key="a" agentId={e.agent_id} size="sm" showName /> : "None"],
                [
                  "Customer",
                  e.customer_id ? (
                    <Link key="c" href={`/customers/${e.customer_id}`} className="text-info-text hover:underline">
                      View customer
                    </Link>
                  ) : (
                    "None"
                  ),
                ],
                [
                  "Transaction",
                  e.transaction_id ? (
                    <Link key="tx" href={`/payments/${e.transaction_id}`} className="text-info-text hover:underline">
                      View transaction
                    </Link>
                  ) : (
                    "None"
                  ),
                ],
                ["Event ID", <span key="i" className="num text-xs">{e.id}</span>],
              ]}
            />
          </Panel>

          <Panel
            title="Explanation"
            actions={
              canExplain && (
                <Button variant="outline" size="sm" onClick={() => explain.mutate()} disabled={explain.isPending}>
                  <Sparkles aria-hidden /> {explain.isPending ? "Explaining..." : e.explanation ? "Explain again" : "Explain"}
                </Button>
              )
            }
          >
            {e.explanation ? (
              <p className="leading-relaxed">{e.explanation}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No explanation yet.{" "}
                {canExplain ? "Ask the security agent to explain this alert in plain words." : "A user with agents:write can ask the security agent."}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              The explanation is advisory. Detection and the recommended action come from deterministic rules the model cannot change.
            </p>
          </Panel>

          <Panel title="Evidence">
            <JsonView value={e.evidence} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Resolution">
            {!canWrite ? (
              <Notice icon={Lock} tone="neutral" title="View only">
                Resolving events requires the security:write permission.
              </Notice>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  resolve.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="res-status">New status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Resolution)}>
                    <SelectTrigger id="res-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {humanize(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-note">Note</Label>
                  <Textarea
                    id="res-note"
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    placeholder="What did you find? What was done?"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={resolve.isPending}>
                  {resolve.isPending ? "Saving..." : "Save resolution"}
                </Button>
                {resolve.error && (
                  <div role="alert">
                    <Notice tone="danger" title="Could not update">
                      {errorText(resolve.error)}
                    </Notice>
                  </div>
                )}
              </form>
            )}
            {(e.resolution_note || e.resolved_at) && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Last resolution {e.resolved_at ? <TimeAgo date={e.resolved_at} /> : ""}
                </p>
                {e.resolution_note && <p className="mt-1">{e.resolution_note}</p>}
              </div>
            )}
          </Panel>

          <Panel title="Resolution history">
            {can(me, "audit:read") ? (
              <AuditTrail resourceType="security_event" resourceId={e.id} />
            ) : (
              <p className="text-sm text-muted-foreground">The full history is visible to roles with audit:read.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
