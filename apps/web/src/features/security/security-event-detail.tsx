"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Eye, Info, Loader2, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_META, ErrorState, SeverityBadge, StatusBadge, TimeAgo, humanize } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Execution, SecurityEvent } from "@/lib/types";
import { AuditTrail } from "@/features/audit/audit-trail";
import { Detector } from "./security-page";
import { DetailList, DetailPage, JsonView, Notice, Panel, RiskScore, errorText } from "./shared";

type Resolution = "INVESTIGATING" | "RESOLVED" | "DISMISSED";
const RES: Record<Resolution, { label: string; verb: string }> = {
  INVESTIGATING: { label: "Mark investigating", verb: "marked as investigating" },
  RESOLVED: { label: "Resolve", verb: "resolved and written to the audit log" },
  DISMISSED: { label: "Dismiss", verb: "dismissed" },
};

export function SecurityEventDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [pending, setPending] = useState<Resolution | null>(null);
  const [note, setNote] = useState("");
  const key = [...qk.security, "event", id];

  const q = useQuery({ queryKey: key, queryFn: () => api.get<SecurityEvent>(`/security/events/${id}`) });

  const resolve = useMutation({
    mutationFn: (status: Resolution) => api.post<SecurityEvent>(`/security/events/${id}/resolve`, { status, note: note.trim() }),
    onSuccess: (ev, status) => {
      qc.setQueryData(key, ev);
      toast.success(`Event ${RES[status].verb}`);
      setNote("");
      setPending(null);
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.security });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const explain = useMutation({
    mutationFn: () => api.post<Execution>("/agents/security/execute", { task_type: "explain", payload: { security_event_id: id } }),
    onSuccess: (ex) => {
      if (ex.status === "FAILED") toast.error(ex.error ?? "The security agent could not explain this event.");
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => {
      q.refetch();
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  if (q.isLoading)
    return (
      <div className="flex flex-col gap-[18px]" aria-busy>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-96 max-w-full" />
        <div className="grid gap-[18px] md:grid-cols-2">
          <Skeleton className="h-72 rounded-[22px]" />
          <Skeleton className="h-72 rounded-[22px]" />
        </div>
      </div>
    );
  if (q.error || !q.data) return <ErrorState error={q.error} title="Could not load this security event" onRetry={() => q.refetch()} />;

  const e = q.data;
  const canWrite = can(me, "security:write");
  const canExplain = can(me, "agents:write");
  const open = e.status === "OPEN" || e.status === "INVESTIGATING";

  const actionBtn = (status: Resolution, Icon: typeof Check, primary?: boolean) =>
    canWrite &&
    open &&
    e.status !== status && (
      <Button key={status} variant={primary ? "default" : "outline"} size="lg" className="h-10 text-[13.5px] font-extrabold" onClick={() => setPending(status)}>
        <Icon aria-hidden className="size-[15px]" strokeWidth={2.2} /> {RES[status].label}
      </Button>
    );

  return (
    <>
      <DetailPage
        back="/security"
        backLabel="All security"
        tile={{ icon: ShieldAlert, color: "var(--c-security)", bg: "var(--c-security-bg)" }}
        eyebrow={`Security event · ${humanize(e.category)}`}
        title={humanize(e.event_type)}
        pill={<SeverityBadge severity={e.severity} size="lg" />}
        meta={[{ text: <Detector value={e.detector} /> }, { text: <TimeAgo date={e.created_at} /> }, { text: <StatusBadge status={e.status} /> }]}
        actions={
          <>
            {canExplain && (
              <Button variant="outline" size="lg" className="h-10 text-[13.5px] font-extrabold" onClick={() => explain.mutate()} disabled={explain.isPending}>
                {explain.isPending ? <Loader2 aria-hidden className="size-[15px] animate-spin" /> : <Sparkles aria-hidden className="size-[15px]" strokeWidth={2.2} />}
                {explain.isPending ? "Explaining…" : e.explanation ? "Explain again" : "Explain"}
              </Button>
            )}
            {actionBtn("INVESTIGATING", Eye)}
            {actionBtn("DISMISSED", Ban)}
            {actionBtn("RESOLVED", Check, true)}
          </>
        }
        notice={
          <Notice icon={Info} tone="neutral" title="What happened.">
            {e.description}
          </Notice>
        }
      >
        <Panel title="Assessment">
          <DetailList
            items={[
              ["Risk score", e.risk_score == null ? "-" : <RiskScore key="r" value={e.risk_score} />],
              ["Status", <StatusBadge key="s" status={e.status} />],
              ["Raised by", e.agent_id ? AGENT_META[e.agent_id]?.full ?? e.agent_id : "Auth middleware"],
              ["Recommended action", e.recommended_action ? humanize(e.recommended_action) : "None"],
              [
                "Related transaction",
                e.transaction_id ? (
                  <Link key="tx" href={`/payments/${e.transaction_id}`}>
                    View transaction
                  </Link>
                ) : (
                  "—"
                ),
              ],
              [
                "Customer",
                e.customer_id ? (
                  <Link key="c" href={`/customers/${e.customer_id}`}>
                    View customer
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Detected", formatDateTime(e.created_at), true],
              ["Explanation", "Template + model (cannot change the decision)"],
              ["Event ID", e.id.slice(0, 8), true],
            ]}
          />
          {(e.resolution_note || e.resolved_at) && (
            <p className="mt-3 rounded-xl bg-panel2 px-3 py-2.5 text-[12.5px] text-t2">
              <span className="font-extrabold text-text">Last resolution </span>
              {e.resolved_at && <TimeAgo date={e.resolved_at} />}
              {e.resolution_note && <span className="block">{e.resolution_note}</span>}
            </p>
          )}
          {!canWrite && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-t3">
              <Lock aria-hidden className="size-3.5" /> Resolving events requires security:write.
            </p>
          )}
        </Panel>

        <Panel title="Explanation">
          {e.explanation ? (
            <p className="text-[13.5px] leading-[1.5] text-t2">{e.explanation}</p>
          ) : (
            <p className="text-[13px] text-t3">
              No explanation yet. {canExplain ? "Ask the security agent to explain this alert in plain words." : "A user with agents:write can ask the security agent."}
            </p>
          )}
          <p className="mt-3 text-xs text-t4">The explanation is advisory. Detection and the recommended action come from deterministic rules the model cannot change.</p>
        </Panel>

        <Panel title="Evidence">
          <JsonView value={e.evidence} />
        </Panel>

        <Panel title="Resolution history">
          {can(me, "audit:read") ? <AuditTrail resourceType="security_event" resourceId={e.id} /> : <p className="text-[13px] text-t3">The full history is visible to roles with audit:read.</p>}
        </Panel>
      </DetailPage>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              if (pending) resolve.mutate(pending);
            }}
          >
            <DialogHeader>
              <DialogTitle>{pending ? RES[pending].label : ""}</DialogTitle>
              <DialogDescription>The new status and your note are written to the audit log.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="res-note">Note</Label>
              <Textarea id="res-note" rows={3} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What did you find? What was done?" />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resolve.isPending}>
                {resolve.isPending ? "Saving…" : pending ? RES[pending].label : ""}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
