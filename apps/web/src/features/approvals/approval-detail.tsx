"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleHelp, Hand, Loader2, Lock, RotateCcw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGENT_META, ErrorState, Money, StatusBadge, TimeAgo, humanize, statusTone, type Tone } from "@/components/ui-kit";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Approval, ApprovalDetail } from "@/lib/types";
import { AuditTrail } from "@/features/audit/audit-trail";
import { DetailItem, DetailList, DetailPage, JsonView, Notice, Panel, RiskScore } from "@/features/security/shared";
import { OPEN, isRefund } from "./approvals-page";
import { Countdown } from "./countdown";

type Decision = "approve" | "reject" | "request-information";
const SEV_TONE: Record<string, Tone> = { LOW: "info", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger" };
const DECISION: Record<Decision, { title: string; cta: string; done: string }> = {
  approve: { title: "Approve release", cta: "Approve", done: "Approved. The Payment agent resumes the transaction." },
  reject: { title: "Reject", cta: "Reject", done: "Rejected. Payment cancelled and logged." },
  "request-information": { title: "Request info", cta: "Send request", done: "Information requested from the requester." },
};

function decisionError(err: unknown): { title: string; body: string; tone: "danger" | "warning" } {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "SELF_APPROVAL_FORBIDDEN":
        return {
          tone: "danger",
          title: "Four-eyes rule: you cannot decide your own request.",
          body: "You requested this action, so a different person with the approvals:decide permission must approve or reject it. The server refused the decision and recorded the attempt in the audit log as CRITICAL. You can still request more information.",
        };
      case "APPROVAL_CLOSED":
        return { tone: "warning", title: "This request is already closed.", body: `${err.message}. Refresh to see the final decision.` };
      case "APPROVAL_EXPIRED":
        return { tone: "warning", title: "This request has expired.", body: "Expired requests cannot be decided. The agent must raise a new one." };
      case "NOTES_REQUIRED":
        return { tone: "warning", title: "A note is required.", body: "Explain why you are rejecting this request." };
    }
    if (err.status === 403) return { tone: "danger", title: "Not allowed.", body: err.message || "Your role cannot decide approvals." };
    return { tone: "danger", title: "Decision failed.", body: err.message };
  }
  return { tone: "danger", title: "Decision failed.", body: "Something went wrong. Try again." };
}

export function ApprovalDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [pending, setPending] = useState<Decision | null>(null);
  const [notes, setNotes] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);

  const q = useQuery({ queryKey: [...qk.approvals, "detail", id], queryFn: () => api.get<ApprovalDetail>(`/approvals/${id}`) });

  const decide = useMutation({
    mutationFn: (d: Decision) => api.post<Approval>(`/approvals/${id}/${d}`, { notes: notes.trim() }),
    onSuccess: (_, d) => {
      toast.success(DECISION[d].done);
      setNotes("");
      setPending(null);
    },
    onError: () => setPending(null),
    onSettled: () => {
      // Self-approval attempts are audited server-side even on 403, so refresh the trail too.
      qc.invalidateQueries({ queryKey: qk.approvals });
      qc.invalidateQueries({ queryKey: qk.payments });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const submit = () => {
    if (!pending) return;
    if (pending === "reject" && !notes.trim()) {
      setNoteMissing(true);
      return;
    }
    setNoteMissing(false);
    decide.mutate(pending);
  };

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
  if (q.error || !q.data) return <ErrorState error={q.error} title="Could not load this approval" onRetry={() => q.refetch()} />;

  const a = q.data;
  const ctx = a.context;
  const tx = ctx?.transaction ?? a.transaction;
  const ev = ctx?.security_event;
  const cust = ctx?.customer ?? a.customer;
  const open = OPEN.has(a.status);
  const canDecide = can(me, "approvals:decide");
  const mine = !!me && !!a.requested_by_user && a.requested_by_user.toLowerCase() === me.email.toLowerCase();
  const last = a.decisions.at(-1);
  const err = decide.error ? decisionError(decide.error) : null;
  const requestedBy = a.requested_by_agent ? AGENT_META[a.requested_by_agent]?.full ?? a.requested_by_agent : a.requested_by_user ?? "system";

  const decisionButton = (d: Decision, Icon: typeof Check, primary?: boolean) => {
    const btn = (
      <Button
        variant={primary ? "default" : "outline"}
        size="lg"
        className="h-10 text-[13.5px] font-extrabold"
        disabled={!canDecide || (mine && d !== "request-information") || decide.isPending}
        onClick={() => setPending(d)}
      >
        {decide.isPending && decide.variables === d ? <Loader2 aria-hidden className="size-[15px] animate-spin" /> : <Icon aria-hidden className="size-[15px]" strokeWidth={2.2} />}
        {DECISION[d].title}
      </Button>
    );
    const why = !canDecide ? "Your role cannot decide approvals (approvals:decide)." : mine && d !== "request-information" ? "Four-eyes rule: you requested this, another person must decide." : null;
    if (!why) return btn;
    return (
      <Tooltip key={d}>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            {btn}
          </span>
        </TooltipTrigger>
        <TooltipContent>{why}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      <DetailPage
        back="/approvals"
        backLabel="All approvals"
        tile={{ icon: isRefund(a) ? RotateCcw : Hand, color: "var(--c-sales)", bg: "var(--c-sales-bg)" }}
        eyebrow={`Approval · ${tx?.reference ?? a.id.slice(0, 8)}`}
        title={humanize(a.action)}
        pill={<StatusBadge status={a.status} size="lg" />}
        meta={[
          ...(tx ? [{ text: formatMoney(tx.amount), mono: true }] : []),
          {
            text: open ? (
              <>
                Expires in <Countdown to={a.expires_at} className="text-[13px]" />
              </>
            ) : (
              `Decided by ${last?.decided_by_email ?? "—"}`
            ),
          },
        ]}
        actions={
          open ? (
            <>
              {decisionButton("reject", X)}
              {decisionButton("request-information", CircleHelp)}
              {decisionButton("approve", Check, true)}
            </>
          ) : (
            <Button asChild variant="outline" size="lg" className="h-10 text-[13.5px] font-extrabold">
              <Link href="/approvals">
                <ArrowLeft aria-hidden className="size-[15px]" /> Back to queue
              </Link>
            </Button>
          )
        }
        notice={
          <>
            <Notice icon={ShieldAlert} tone="warning" title="Why it is here.">
              {a.reason}
            </Notice>
            {err && (
              <div role="alert" className="mt-[18px]">
                <Notice icon={ShieldAlert} tone={err.tone} title={err.title}>
                  {err.body}
                  {decide.error instanceof ApiError && <span className="num ml-1 text-xs">({decide.error.code})</span>}
                </Notice>
              </div>
            )}
            {!open && (
              <div className="mt-[18px]">
                <Notice icon={Lock} tone="neutral" title="Closed.">
                  This request is {humanize(a.status).toLowerCase()}. Decisions are final and cannot be edited.
                </Notice>
              </div>
            )}
          </>
        }
      >
        <Panel title="Request">
          <DetailList
            items={[
              ["Requested by", requestedBy, !a.requested_by_agent],
              [
                "Customer",
                cust ? (
                  <Link key="c" href={`/customers/${cust.id}`}>
                    {cust.full_name}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Amount", tx ? <Money key="m" value={tx.amount} /> : "—", true],
              ["Risk score", a.risk_score == null ? "—" : <RiskScore key="r" value={a.risk_score} />],
              ["Four-eyes rule", mine ? "You are the requester ✗" : "You are not the requester ✓"],
              ["Expires", open && a.expires_at ? formatDateTime(a.expires_at) : "—", true],
              [
                "Transaction",
                tx ? (
                  <Link key="t" href={`/payments/${tx.id}`}>
                    {tx.reference}
                  </Link>
                ) : (
                  "—"
                ),
                true,
              ],
              ["Requested", formatDateTime(a.created_at), true],
              ["Request ID", a.id.slice(0, 8), true],
            ]}
          />
          {a.risk_flags.length > 0 && (
            <>
              <p className="eyebrow mt-4">Risk flags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.risk_flags.map((f) => (
                  <span key={f} className="num rounded-lg border border-danger bg-danger-bg px-2 py-1 text-[11.5px] text-danger">
                    {f}
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Evidence" count={[ev, ctx?.customer?.purchase_intent != null, tx].filter(Boolean).length}>
          <ol>
            {ev && (
              <DetailItem
                tile="security"
                title={humanize(ev.event_type)}
                pill={{ label: humanize(ev.severity), tone: SEV_TONE[ev.severity] ?? "neutral" }}
                sub={
                  <>
                    {ev.description}{" "}
                    <Link href={`/security/${ev.id}`} className="font-bold">
                      Open event →
                    </Link>
                  </>
                }
                time={<TimeAgo date={ev.created_at} />}
              />
            )}
            {!ev && a.security_event_id && (
              <DetailItem
                tile="security"
                title="Security event"
                sub={
                  <Link href={`/security/${a.security_event_id}`} className="font-bold">
                    Open event →
                  </Link>
                }
              />
            )}
            {ctx?.customer && ctx.customer.purchase_intent != null && (
              <DetailItem
                tile="intelligence"
                title={`Customer intent ${ctx.customer.purchase_intent.toFixed(2)}`}
                pill={ctx.customer.sentiment_label ? { label: humanize(ctx.customer.sentiment_label.toUpperCase()), tone: ctx.customer.sentiment_label.startsWith("pos") ? "success" : ctx.customer.sentiment_label.startsWith("neg") ? "danger" : "neutral" } : undefined}
                sub={[ctx.customer.journey_stage && `${humanize(ctx.customer.journey_stage)} stage`, ctx.customer.objections?.length && `objections: ${ctx.customer.objections.map((o) => humanize(o.toUpperCase())).join(", ")}`, ctx.customer.segment && humanize(ctx.customer.segment.toUpperCase())].filter(Boolean).join(" · ") || "No objections recorded"}
              />
            )}
            {ctx?.transaction && (
              <DetailItem
                tile="payment"
                title={ctx.transaction.product?.name ?? "Transaction"}
                pill={{ label: humanize(ctx.transaction.status), tone: statusTone(ctx.transaction.status) }}
                sub={`${ctx.transaction.payment_method ?? "simulated"} · risk ${ctx.transaction.risk_score == null ? "—" : formatPercent(ctx.transaction.risk_score, { digits: 0 })}${ctx.transaction.risk_flags?.length ? ` · ${ctx.transaction.risk_flags.join(", ")}` : ""}`}
                time={<TimeAgo date={ctx.transaction.created_at} />}
                mono
              />
            )}
            {!ev && !a.security_event_id && !ctx?.customer && !ctx?.transaction && <li className="border-t border-hair py-3 text-[13px] text-t3">No linked evidence.</li>}
          </ol>
        </Panel>

        <Panel title="Decision history" count={a.decisions.length}>
          {a.decisions.length === 0 ? (
            <p className="border-t border-hair py-3 text-[13px] text-t3">No decisions yet.</p>
          ) : (
            <ol>
              {[...a.decisions].reverse().map((d, i) => (
                <DetailItem key={i} tile="human" title={d.decided_by_email} pill={{ label: humanize(d.decision), tone: statusTone(d.decision) }} sub={d.notes || "No note"} time={<TimeAgo date={d.created_at} />} />
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Full context">
          <JsonView value={a.payload} />
        </Panel>

        {can(me, "audit:read") && (
          <Panel title="Audit trail" className="md:col-span-full">
            <AuditTrail resourceType="approval" resourceId={a.id} />
          </Panel>
        )}
      </DetailPage>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setNoteMissing(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{pending ? DECISION[pending].title : ""}</DialogTitle>
              <DialogDescription>
                {pending === "approve" && tx ? `Releases ${formatMoney(tx.amount)} and resumes the payment. ` : ""}
                Your note is stored in the decision history and the audit log.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="notes">Note{pending === "reject" ? " (required)" : ""}</Label>
              <Textarea
                id="notes"
                value={notes}
                maxLength={1000}
                rows={4}
                autoFocus
                onChange={(e) => {
                  setNotes(e.target.value);
                  if (e.target.value.trim()) setNoteMissing(false);
                }}
                placeholder="Why are you making this decision?"
                aria-invalid={noteMissing || undefined}
                aria-describedby="notes-hint"
              />
              <p id="notes-hint" className={noteMissing ? "text-[13px] text-danger" : "text-xs text-t3"}>
                {noteMissing ? "A note is required to reject." : "Required to reject."}
              </p>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={pending === "reject" ? "destructive" : "default"} disabled={decide.isPending}>
                {decide.isPending ? "Saving…" : pending ? DECISION[pending].cta : ""}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
