"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CreditCard, FlaskConical, Hand, Loader2, RotateCcw, ShieldAlert, ShoppingCart, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  BackLink,
  DataTable,
  DetailItem,
  DetailList,
  DetailNotice,
  DetailPage,
  DetailSection,
  ErrorState,
  FactChips,
  Facts,
  KpiCard,
  Money,
  PageTitle,
  RiskBar,
  SeverityBadge,
  StatusBadge,
  TimeAgo,
  humanize,
  type Column,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Approval, OverviewKpis, Paged, SecurityEvent, Transaction, TransactionStatus } from "@/lib/types";
import {
  Clock,
  FieldError,
  FilterChip,
  ListPage,
  SearchBox,
  Toolbar,
  WhoCell,
  actionBtn,
  agentTile,
  errorText,
  initialsOf,
  tighten,
  useDebouncedSearch,
  useUrlParams,
} from "./shared";

const TX_STATUSES: TransactionStatus[] = ["SUCCEEDED", "FAILED", "REQUIRES_APPROVAL", "PROCESSING", "PENDING", "REFUNDED", "CANCELLED"];
const PAGE_SIZE = 25;

// Fictional tokens from apps/api/app/services/payments.py TEST_METHODS. No card data exists anywhere.
const METHOD_LABELS: Record<string, string> = {
  sim_card_success: "Test card, succeeds",
  sim_wallet_success: "Test e-wallet, succeeds",
  sim_card_declined: "Test card, declined",
  sim_insufficient_funds: "Test card, insufficient funds",
  sim_provider_error: "Test card, provider error",
};

/** Mono method chip (list) or label + token (detail). */
export function PaymentMethod({ token, full }: { token: string | null | undefined; full?: boolean }) {
  if (!token) return <span className="text-t4">—</span>;
  if (!full) return <span className="mono text-xs font-medium text-t2" title={METHOD_LABELS[token]}>{token}</span>;
  return (
    <span className="grid text-right">
      <span>{METHOD_LABELS[token] ?? humanize(token.toUpperCase())}</span>
      <span className="num text-xs text-t3">{token}</span>
    </span>
  );
}

/** Backend risk is 0..1; the prototype bar reads 0..100. */
const risk100 = (score: number | null | undefined) => (score == null ? null : Math.round(score * 100));

const columns: Column<Transaction>[] = [
  { key: "ref", header: "Reference", cell: (t) => <span className="num text-[13px] font-semibold">{t.reference}</span> },
  { key: "customer", header: "Customer", cell: (t) => <WhoCell className="max-w-[230px]" initials={initialsOf(t.customer.full_name)} title={t.customer.full_name} sub={t.product.name} /> },
  { key: "method", header: "Method", cell: (t) => <PaymentMethod token={t.payment_method} /> },
  { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} className="h-6 px-[9px]" /> },
  { key: "risk", header: "Risk", cell: (t) => (t.risk_score == null ? <span className="text-t4">—</span> : <RiskBar score={risk100(t.risk_score)} />) },
  { key: "amount", header: "Amount", align: "right", cell: (t) => <Money value={t.amount} currency={t.currency} className="text-[13px] font-semibold" /> },
  { key: "date", header: "Time", align: "right", cell: (t) => <TimeAgo date={t.created_at} className="text-[12.5px] font-medium text-t3" /> },
];

function PaymentKpis() {
  const { data: me } = useMe();
  const enabled = can(me, "analytics:read");
  const kpis = useQuery({ queryKey: [...qk.analytics, "overview"], queryFn: () => api.get<OverviewKpis>("/analytics/overview"), enabled });
  if (!enabled) return null;
  if (kpis.error) return <ErrorState error={kpis.error} title="Could not load payment KPIs" onRetry={() => kpis.refetch()} />;
  const p = kpis.data?.payments ?? {};
  const loading = kpis.isPending;
  const hint = (node: React.ReactNode, color: string) => <span className="font-semibold" style={{ color }}>{node}</span>;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      <KpiCard label="Succeeded" loading={loading} value={formatNumber(p.SUCCEEDED ?? 0)} hint={kpis.data && hint(<Money value={kpis.data.revenue} />, "var(--success)")} />
      <KpiCard label="Failed" loading={loading} value={formatNumber(p.FAILED ?? 0)} hint={hint("declined by the simulator", "var(--danger)")} />
      <KpiCard label="Held" loading={loading} value={formatNumber(p.REQUIRES_APPROVAL ?? 0)} hint={hint("waiting for a human", "var(--warning)")} definition="Transactions the Security agent paused until a human decides." />
      <KpiCard label="Refunded" loading={loading} value={formatNumber(p.REFUNDED ?? 0)} hint={kpis.data && hint(<Money value={kpis.data.refunded} />, "var(--t3)")} />
    </div>
  );
}

export function PaymentsView() {
  const router = useRouter();
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useDebouncedSearch(q, (v) => setParams({ q: v }));

  const list = useQuery({
    queryKey: [...qk.payments, "transactions", { status, q, page }],
    queryFn: () => api.get<Paged<Transaction>>("/payments/transactions", { query: { status, q, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <ListPage>
      <PageTitle
        title="Payments"
        description="Simulated transactions, holds and refunds. Every status change is signed into the audit log."
        actions={
          <span className={`inline-flex items-center gap-[7px] rounded-xl border border-hair bg-panel px-4 text-text shadow-card ${actionBtn}`} title="Payments are simulated; no real money moves.">
            <FlaskConical aria-hidden className="size-[15px]" strokeWidth={2.2} /> Simulated · no real money
          </span>
        }
      />
      <PaymentKpis />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search references…" label="Search transactions" />
        <FilterChip selected={!status} onClick={() => setParams({ status: null })} count={!status ? list.data?.total : undefined}>
          All
        </FilterChip>
        {TX_STATUSES.map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => setParams({ status: s })} count={status === s ? list.data?.total : undefined}>
            {s === "REQUIRES_APPROVAL" ? "Held" : humanize(s)}
          </FilterChip>
        ))}
      </Toolbar>
      <DataTable
        columns={tighten(columns)}
        rows={list.data?.items}
        rowKey={(t) => t.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle="No transactions"
        emptyDescription={status || q ? "Change the filters or run a scenario from Demo control." : "Transactions appear after a checkout."}
        onRowClick={(t) => router.push(`/payments/${t.id}`)}
        page={list.data?.page ?? page}
        pageSize={list.data?.page_size ?? PAGE_SIZE}
        total={list.data?.total}
        onPageChange={(p) => setParams({ page: String(p) })}
        minWidth={900}
      />
    </ListPage>
  );
}

// ---------------------------------------------------------------- detail
// Shapes from apps/api/app/api/v1/payments.py get_transaction.

interface Attempt {
  id: string;
  payment_method: string;
  amount: string;
  outcome: string;
  failure_reason: string | null;
  provider_reference: string | null;
  created_at: string;
}
interface HistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  actor: string | null;
  reason: string | null;
  created_at: string;
}
interface Refund {
  id: string;
  amount: string;
  reason: string;
  status: string;
  approval_id: string | null;
  created_at: string;
  completed_at: string | null;
}
interface TxDetail extends Transaction {
  order_id: string;
  attempts: Attempt[];
  history: HistoryEntry[];
  security_events: SecurityEvent[];
  refunds: Refund[];
  approvals: Approval[];
}

export function TransactionDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: me } = useMe();
  const [refundOpen, setRefundOpen] = useState(false);
  const tx = useQuery({ queryKey: [...qk.payments, "transactions", id], queryFn: () => api.get<TxDetail>(`/payments/transactions/${id}`) });
  const t = tx.data;

  if (tx.error)
    return (
      <>
        <BackLink href="/payments">All payments</BackLink>
        <ErrorState error={tx.error} title="Could not load this transaction" onRetry={() => tx.refetch()} />
      </>
    );

  const pendingRefund = t?.refunds.some((r) => r.status === "PENDING_APPROVAL");
  const showRefund = t && t.status === "SUCCEEDED" && can(me, "payments:refund") && !pendingRefund;
  const held = t?.status === "REQUIRES_APPROVAL";
  const openApproval = t?.approvals.find((a) => a.status === "PENDING_REVIEW");
  const flags = t?.risk_flags ?? [];

  return (
    <>
      <DetailPage
        back={{ href: "/payments", label: "All payments" }}
        eyebrow="Transaction · simulated"
        title={t ? <span className="num">{t.reference}</span> : <Skeleton className="h-8 w-48" />}
        tile={{ icon: CreditCard, ...agentTile("payment") }}
        badge={t && <StatusBadge status={t.status} size="lg" />}
        meta={t ? [<Money key="a" value={t.amount} currency={t.currency} />, t.customer.full_name] : []}
        actions={
          t && (
            <>
              <Button asChild variant="outline" className={actionBtn}>
                <Link href={`/orders/${t.order_id}`}>
                  <ShoppingCart aria-hidden /> Open order
                </Link>
              </Button>
              {showRefund && (
                <Button variant="outline" className={actionBtn} onClick={() => setRefundOpen(true)}>
                  <RotateCcw aria-hidden /> Request refund
                </Button>
              )}
              {held && openApproval && (
                <Button asChild className={actionBtn}>
                  <Link href={`/approvals/${openApproval.id}`}>
                    <Hand aria-hidden /> Decide in Approvals
                  </Link>
                </Button>
              )}
            </>
          )
        }
        notice={
          held ? (
            <DetailNotice icon={Hand} tone="warning" title="Held for a human.">
              Held by the Security agent{flags.length ? `: ${flags.map((f) => humanize(f.toUpperCase()).toLowerCase()).join(", ")}` : ""}. Nothing is charged while it waits.
            </DetailNotice>
          ) : pendingRefund ? (
            <DetailNotice icon={UserCheck} tone="info" title="Refund requested.">
              A refund request is waiting for approval by another administrator (four-eyes rule).
            </DetailNotice>
          ) : undefined
        }
        aside={
          <DetailSection title="Details">
            {t ? (
              <>
                <Facts
                  items={[
                    { k: "Method", v: <PaymentMethod token={t.payment_method} full />, mono: true },
                    {
                      k: "Risk score",
                      v: t.risk_score == null ? "—" : <span className="inline-flex items-center justify-end gap-2"><RiskBar score={risk100(t.risk_score)} showValue={false} /><span className="num">{risk100(t.risk_score)} / 100</span></span>,
                      mono: true,
                    },
                    {
                      k: "Order",
                      v: (
                        <Link href={`/orders/${t.order_id}`} className="text-brand-text hover:underline">
                          Open order
                        </Link>
                      ),
                    },
                    {
                      k: "Program",
                      v: (
                        <Link href={`/products/${t.product.id}`} className="hover:underline">
                          {t.product.name}
                        </Link>
                      ),
                    },
                    {
                      k: "Customer",
                      v: (
                        <Link href={`/customers/${t.customer.id}`} className="hover:underline">
                          {t.customer.full_name}
                        </Link>
                      ),
                    },
                    { k: "Provider", v: `${t.provider} · simulator`, mono: true },
                    { k: "Failure reason", v: t.failure_reason ? humanize(t.failure_reason.toUpperCase()) : "—" },
                    { k: "Created", v: formatDateTime(t.created_at) },
                    { k: "Completed", v: formatDateTime(t.completed_at) },
                  ]}
                />
                <FactChips title="Risk flags" chips={flags.length ? flags.map((f) => ({ label: f, color: "var(--danger)", bg: "var(--danger-bg)" })) : [{ label: "no flags", muted: false, color: "var(--t3)", bg: "var(--panel3)" }]} />
              </>
            ) : (
              <Skeleton className="mt-3 h-64" />
            )}
          </DetailSection>
        }
      >
        {!t ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <DetailSection title="State machine" count={t.history.length}>
              <DetailList empty="No status changes recorded.">
                {t.history.map((h) => (
                  <DetailItem
                    key={h.id}
                    icon={CreditCard}
                    {...agentTile("payment")}
                    title={h.from_status ? `${humanize(h.from_status)} → ${humanize(h.to_status)}` : humanize(h.to_status)}
                    pill={<StatusBadge status={h.to_status} size="sm" />}
                    sub={[h.reason, h.actor && `by ${h.actor}`].filter(Boolean).join(" · ") || undefined}
                    time={<Clock date={h.created_at} />}
                  />
                ))}
              </DetailList>
            </DetailSection>
            <DetailSection title="Attempts" count={t.attempts.length}>
              <DetailList empty="No attempts yet.">
                {t.attempts.map((a) => (
                  <DetailItem
                    key={a.id}
                    icon={FlaskConical}
                    {...agentTile("payment")}
                    title={METHOD_LABELS[a.payment_method] ?? humanize(a.payment_method.toUpperCase())}
                    pill={<StatusBadge status={a.outcome} size="sm" />}
                    sub={[a.payment_method, a.failure_reason && humanize(a.failure_reason.toUpperCase()), a.provider_reference && `ref ${a.provider_reference}`].filter(Boolean).join(" · ")}
                    mono
                    time={<Clock date={a.created_at} />}
                  />
                ))}
              </DetailList>
            </DetailSection>
            <DetailSection title="Security events" count={t.security_events.length}>
              <DetailList empty="No security event linked to this transaction.">
                {t.security_events.map((e) => (
                  <DetailItem
                    key={e.id}
                    icon={ShieldAlert}
                    {...agentTile("security")}
                    title={humanize(e.event_type.toUpperCase())}
                    pill={
                      <>
                        <SeverityBadge severity={e.severity} size="sm" />
                        <StatusBadge status={e.status} size="sm" />
                      </>
                    }
                    sub={e.description}
                    time={<TimeAgo date={e.created_at} />}
                    actions={
                      <Button variant="outline" size="xs" onClick={() => router.push(`/security/${e.id}`)}>
                        Open
                      </Button>
                    }
                  />
                ))}
              </DetailList>
            </DetailSection>
            <DetailSection title="Approvals" count={t.approvals.length}>
              <DetailList empty="No approval request for this transaction.">
                {t.approvals.map((a) => (
                  <DetailItem
                    key={a.id}
                    icon={Hand}
                    {...agentTile("human")}
                    title={humanize(a.action)}
                    pill={<StatusBadge status={a.status} size="sm" />}
                    sub={a.reason}
                    time={<TimeAgo date={a.created_at} />}
                    actions={
                      <Button variant="outline" size="xs" onClick={() => router.push(`/approvals/${a.id}`)}>
                        Open
                      </Button>
                    }
                  />
                ))}
              </DetailList>
            </DetailSection>
            <DetailSection title="Refunds" count={t.refunds.length}>
              <DetailList empty="No refund requested.">
                {t.refunds.map((r) => (
                  <DetailItem
                    key={r.id}
                    icon={RotateCcw}
                    {...agentTile("payment")}
                    title={<Money value={r.amount} currency={t.currency} />}
                    pill={<StatusBadge status={r.status} size="sm" />}
                    sub={
                      <>
                        {r.reason} · requested {formatDateTime(r.created_at)}
                        {r.completed_at && `, completed ${formatDateTime(r.completed_at)}`}
                      </>
                    }
                    time={<TimeAgo date={r.created_at} />}
                    actions={
                      r.approval_id ? (
                        <Button variant="outline" size="xs" onClick={() => router.push(`/approvals/${r.approval_id}`)}>
                          Approval
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </DetailList>
            </DetailSection>
          </>
        )}
      </DetailPage>
      {t && <RefundDialog txId={t.id} open={refundOpen} onOpenChange={setRefundOpen} />}
    </>
  );
}

const refundSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters").max(300, "300 characters max"),
});

/** "Request refund" opens an approval request (four-eyes rule); nothing is refunded immediately. */
function RefundDialog({ txId, open, onOpenChange }: { txId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const form = useForm<z.infer<typeof refundSchema>>({ resolver: zodResolver(refundSchema), defaultValues: { reason: "" } });
  const { errors } = form.formState;
  const refund = useMutation({
    mutationFn: (reason: string) => api.post<Approval>(`/payments/transactions/${txId}/refund`, { reason }),
    onSuccess: (approval) => {
      qc.invalidateQueries({ queryKey: qk.payments });
      qc.invalidateQueries({ queryKey: qk.approvals });
      form.reset();
      onOpenChange(false);
      toast.success("Refund request sent to Approvals (four-eyes rule)", {
        action: { label: "Open approval", onClick: () => router.push(`/approvals/${approval.id}`) },
      });
    },
    onError: (err) => form.setError("root", { message: errorText(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Request a refund</DialogTitle>
          <DialogDescription>Refunds are never immediate. Another administrator must approve before any money moves.</DialogDescription>
        </DialogHeader>
        <form id="refund-form" onSubmit={form.handleSubmit((v) => refund.mutate(v.reason))} noValidate className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="refund-reason" className="text-[12.5px] font-bold text-t2">Reason</Label>
            <Textarea id="refund-reason" rows={3} aria-invalid={!!errors.reason || undefined} aria-describedby={errors.reason ? "refund-reason-err" : undefined} {...form.register("reason")} />
            <FieldError id="refund-reason-err" message={errors.reason?.message} />
          </div>
          {errors.root && (
            <p role="alert" className="rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
              {errors.root.message}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="refund-form" disabled={refund.isPending}>
            {refund.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
            Request refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
