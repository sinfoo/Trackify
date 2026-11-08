"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, CircleHelp, CircleX, Loader2, Lock, ShieldAlert, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ErrorState,
  Money,
  PageHeader,
  SeverityBadge,
  SimulatedBadge,
  StatusBadge,
  TimeAgo,
  humanize,
} from "@/components/ui-kit";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Approval, ApprovalDetail } from "@/lib/types";
import { AuditTrail } from "@/features/audit/audit-trail";
import { DetailList, JsonView, Notice, Panel, RiskScore } from "@/features/security/shared";
import { requester } from "./approvals-page";
import { Countdown } from "./countdown";

type Decision = "approve" | "reject" | "request-information";
const row = (k: string, v: ReactNode): [ReactNode, ReactNode] => [k, v];
const OPEN = new Set(["PENDING_REVIEW", "INFO_REQUESTED", "INFORMATION_REQUESTED"]);

function decisionError(err: unknown): { title: string; body: string; tone: "danger" | "warning" } {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "SELF_APPROVAL_FORBIDDEN":
        return {
          tone: "danger",
          title: "Four-eyes rule: you cannot decide your own request",
          body:
            "You requested this action, so a different person with the approvals:decide permission must approve or reject it. " +
            "The server refused the decision and recorded the attempt in the audit log as CRITICAL. You can still request more information.",
        };
      case "APPROVAL_CLOSED":
        return { tone: "warning", title: "This request is already closed", body: `${err.message}. Refresh to see the final decision.` };
      case "APPROVAL_EXPIRED":
        return { tone: "warning", title: "This request has expired", body: "Expired requests cannot be decided. The agent must raise a new one." };
      case "NOTES_REQUIRED":
        return { tone: "warning", title: "A note is required", body: "Explain why you are rejecting this request." };
    }
    if (err.status === 403) return { tone: "danger", title: "Not allowed", body: err.message || "Your role cannot decide approvals." };
    return { tone: "danger", title: "Decision failed", body: err.message };
  }
  return { tone: "danger", title: "Decision failed", body: "Something went wrong. Try again." };
}

export function ApprovalDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [notes, setNotes] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);

  const q = useQuery({
    queryKey: [...qk.approvals, "detail", id],
    queryFn: () => api.get<ApprovalDetail>(`/approvals/${id}`),
  });

  const decide = useMutation({
    mutationFn: (d: Decision) => api.post<Approval>(`/approvals/${id}/${d}`, { notes: notes.trim() }),
    onSuccess: (_, d) => {
      toast.success(d === "approve" ? "Approved" : d === "reject" ? "Rejected" : "Information requested");
      setNotes("");
    },
    onSettled: () => {
      // Self-approval attempts are audited server-side even on 403, so refresh the trail too.
      qc.invalidateQueries({ queryKey: qk.approvals });
      qc.invalidateQueries({ queryKey: qk.payments });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const submit = (d: Decision) => {
    if (d === "reject" && !notes.trim()) {
      setNoteMissing(true);
      return;
    }
    setNoteMissing(false);
    decide.mutate(d);
  };

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
      <Link href="/approvals">
        <ArrowLeft aria-hidden /> All approvals
      </Link>
    </Button>
  );

  if (q.isLoading)
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  if (q.error || !q.data)
    return (
      <>
        {back}
        <ErrorState error={q.error} title="Could not load this approval" onRetry={() => q.refetch()} />
      </>
    );

  const a = q.data;
  const ctx = a.context;
  const tx = ctx?.transaction;
  const ev = ctx?.security_event;
  const cust = ctx?.customer ?? a.customer;
  const t = tx ?? a.transaction;
  const open = OPEN.has(a.status);
  const canDecide = can(me, "approvals:decide");
  const mine = !!me && !!a.requested_by_user && a.requested_by_user.toLowerCase() === me.email.toLowerCase();
  const err = decide.error ? decisionError(decide.error) : null;
  // Approving runs the payment and the analyst/strategy agents server-side: several seconds, so show progress.
  const busy = (d: Decision, Icon: typeof CircleCheck) =>
    decide.isPending && decide.variables === d ? <Loader2 aria-hidden className="animate-spin" /> : <Icon aria-hidden />;

  return (
    <>
      {back}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {humanize(a.action)} <StatusBadge status={a.status} />
          </span>
        }
        description={a.reason}
        actions={open && <Countdown to={a.expires_at} className="text-base" />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Request">
            <DetailList
              items={[
                ["Action", <span key="a" className="num">{a.action}</span>],
                ["Requested by", requester(a)],
                ["Reason", a.reason],
                ["Requested", <span key="c">{formatDateTime(a.created_at)} (<TimeAgo date={a.created_at} />)</span>],
                ["Expires", a.expires_at ? formatDateTime(a.expires_at) : "No expiry"],
                ["Request ID", <span key="i" className="num text-xs">{a.id}</span>],
              ]}
            />
          </Panel>

          <Panel title="Risk assessment">
            <DetailList
              items={[
                ["Risk score", <RiskScore key="r" value={a.risk_score} />],
                [
                  "Flags",
                  a.risk_flags.length ? (
                    <span key="f" className="flex flex-wrap gap-1.5">
                      {a.risk_flags.map((f) => (
                        <span key={f} className="num rounded-md border bg-muted/50 px-2 py-0.5 text-xs">
                          {f}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "None"
                  ),
                ],
                [
                  "Security event",
                  ev ? (
                    <Link key="e" href={`/security/${ev.id}`} className="inline-flex flex-wrap items-center gap-2 text-info-text hover:underline">
                      <SeverityBadge severity={ev.severity} /> {humanize(ev.event_type)}
                    </Link>
                  ) : a.security_event_id ? (
                    <Link key="e" href={`/security/${a.security_event_id}`} className="text-info-text hover:underline">
                      View event
                    </Link>
                  ) : (
                    "None linked"
                  ),
                ],
              ]}
            />
          </Panel>

          <Panel title="Customer and transaction" actions={t && <SimulatedBadge />}>
            <DetailList
              items={[
                [
                  "Customer",
                  cust ? (
                    <Link key="c" href={`/customers/${cust.id}`} className="text-info-text hover:underline">
                      {cust.full_name}
                    </Link>
                  ) : (
                    "None"
                  ),
                ],
                ...(ctx?.customer?.email ? [row("Email", <span className="num text-xs">{ctx.customer.email}</span>)] : []),
                [
                  "Transaction",
                  t ? (
                    <Link key="t" href={`/payments/${t.id}`} className="num text-info-text hover:underline">
                      {t.reference}
                    </Link>
                  ) : (
                    "None"
                  ),
                ],
                ...(t
                  ? [
                      row("Amount", <Money value={t.amount} className="font-semibold" />),
                      row("Payment status", <StatusBadge status={t.status} />),
                    ]
                  : []),
                ...(tx
                  ? [row("Product", tx.product?.name), row("Method", <span className="num text-xs">{tx.payment_method ?? "-"}</span>)]
                  : []),
              ]}
            />
          </Panel>

          <Panel title="Full context">
            <JsonView value={a.payload} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Decision">
            {!open ? (
              <Notice icon={Lock} tone="neutral" title="Closed">
                This request is {humanize(a.status).toLowerCase()}. Decisions are final and cannot be edited.
              </Notice>
            ) : !canDecide ? (
              <Notice icon={Lock} tone="neutral" title="View only">
                Your role can see this request but cannot decide it. A user with the approvals:decide permission must review it.
              </Notice>
            ) : (
              <div className="space-y-4">
                {mine && (
                  <Notice icon={Users} tone="warning" title="You requested this">
                    The four-eyes rule means another person must approve or reject it. The server will refuse your decision.
                  </Notice>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    maxLength={1000}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (e.target.value.trim()) setNoteMissing(false);
                    }}
                    rows={4}
                    placeholder="Why are you making this decision?"
                    aria-invalid={noteMissing || undefined}
                    aria-describedby="notes-hint"
                  />
                  <p id="notes-hint" className={noteMissing ? "text-sm text-danger-text" : "text-xs text-muted-foreground"}>
                    {noteMissing ? "A note is required to reject." : "Required to reject. Stored in the decision history and audit log."}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Button onClick={() => submit("approve")} disabled={decide.isPending}>
                    {busy("approve", CircleCheck)} {decide.isPending && decide.variables === "approve" ? "Approving…" : "Approve"}
                  </Button>
                  <Button variant="destructive" onClick={() => submit("reject")} disabled={decide.isPending}>
                    {busy("reject", CircleX)} Reject
                  </Button>
                  <Button variant="outline" onClick={() => submit("request-information")} disabled={decide.isPending}>
                    {busy("request-information", CircleHelp)} Request information
                  </Button>
                </div>
                {err && (
                  <div role="alert">
                    <Notice icon={ShieldAlert} tone={err.tone} title={err.title}>
                      {err.body}
                      {decide.error instanceof ApiError && <span className="num mt-1 block text-xs">{decide.error.code}</span>}
                    </Notice>
                  </div>
                )}
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <UserCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Agents can request, only humans decide. The requester cannot approve their own request.
            </p>
          </Panel>

          <Panel title="Decision history">
            {a.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions yet.</p>
            ) : (
              <ol className="space-y-3">
                {[...a.decisions].reverse().map((d, i) => (
                  <li key={i} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge status={d.decision} />
                      <TimeAgo date={d.created_at} className="text-xs text-muted-foreground" />
                    </div>
                    <p className="num mt-2 text-xs">{d.decided_by_email}</p>
                    {d.notes && <p className="mt-1 text-muted-foreground">{d.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {can(me, "audit:read") && (
            <Panel title="Audit trail">
              <AuditTrail resourceType="approval" resourceId={a.id} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
