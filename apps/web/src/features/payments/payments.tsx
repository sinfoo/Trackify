"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FlaskConical, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  ErrorState,
  KpiCard,
  Money,
  PageHeader,
  SeverityBadge,
  SimulatedBadge,
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
import { BackLink, Detail, DetailList, FieldError, RiskScore, Section, Timeline, errorText, useUrlParams } from "./shared";

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

export function PaymentMethod({ token }: { token: string | null | undefined }) {
  if (!token) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="grid">
      <span className="text-sm">{METHOD_LABELS[token] ?? humanize(token.toUpperCase())}</span>
      <span className="num text-xs text-muted-foreground">{token}</span>
    </span>
  );
}

export function SimulatedBanner() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-sm text-info-text">
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      Simulated payments. No real money or card data.
    </p>
  );
}

const columns: Column<Transaction>[] = [
  {
    key: "ref",
    header: "Reference",
    cell: (t) => (
      <Link href={`/payments/${t.id}`} className="num font-medium text-info-text hover:underline">
        {t.reference}
      </Link>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    cell: (t) => (
      <Link href={`/customers/${t.customer.id}`} className="hover:underline">
        {t.customer.full_name}
      </Link>
    ),
  },
  { key: "product", header: "Product", cell: (t) => <span className="line-clamp-2 min-w-32">{t.product.name}</span> },
  { key: "amount", header: "Amount", align: "right", cell: (t) => <Money value={t.amount} currency={t.currency} /> },
  { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
  {
    key: "provider",
    header: "Provider",
    cell: (t) => (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-sm">{t.provider}</span>
        <SimulatedBadge />
      </span>
    ),
  },
  { key: "method", header: "Method", cell: (t) => <PaymentMethod token={t.payment_method} /> },
  { key: "risk", header: "Risk", cell: (t) => <RiskScore score={t.risk_score} /> },
  { key: "date", header: "Date", cell: (t) => <TimeAgo date={t.created_at} /> },
];

function PaymentKpis() {
  const { data: me } = useMe();
  const kpis = useQuery({
    queryKey: [...qk.analytics, "overview"],
    queryFn: () => api.get<OverviewKpis>("/analytics/overview"),
    enabled: can(me, "analytics:read"),
  });
  if (!can(me, "analytics:read")) return null;
  if (kpis.error) return <ErrorState error={kpis.error} title="Could not load payment KPIs" onRetry={() => kpis.refetch()} className="mb-4" />;
  const p = kpis.data?.payments ?? {};
  const loading = kpis.isPending;
  return (
    <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard label="Succeeded" loading={loading} value={formatNumber(p.SUCCEEDED ?? 0)} hint={kpis.data && <Money value={kpis.data.revenue} />} />
      <KpiCard label="Failed" loading={loading} value={formatNumber(p.FAILED ?? 0)} />
      <KpiCard
        label="Held for approval"
        loading={loading}
        value={formatNumber(p.REQUIRES_APPROVAL ?? 0)}
        definition="Transactions the security agent paused until a human decides."
      />
      <KpiCard label="Refunded" loading={loading} value={formatNumber(p.REFUNDED ?? 0)} hint={kpis.data && <Money value={kpis.data.refunded} />} />
    </div>
  );
}

export function PaymentsView() {
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const list = useQuery({
    queryKey: [...qk.payments, "transactions", { status, q, page }],
    queryFn: () =>
      api.get<Paged<Transaction>>("/payments/transactions", { query: { status, q, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Payments" description="Simulated transactions, holds and refunds." actions={<SimulatedBadge />} />
      <SimulatedBanner />
      <PaymentKpis />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="overflow-x-auto">
            <Tabs value={status || "ALL"} onValueChange={(v) => setParams({ status: v === "ALL" ? null : v })}>
              <TabsList aria-label="Filter by status">
                <TabsTrigger value="ALL">All</TabsTrigger>
                {TX_STATUSES.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {s === "REQUIRES_APPROVAL" ? "Held" : humanize(s)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="grid gap-1.5 lg:w-72">
            <Label htmlFor="tx-search">Search</Label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                id="tx-search"
                type="search"
                placeholder="Reference or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(t) => t.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          emptyTitle="No transactions"
          emptyDescription={status || q ? "Try clearing a filter." : "Transactions appear after a checkout."}
          page={list.data?.page ?? page}
          pageSize={list.data?.page_size ?? PAGE_SIZE}
          total={list.data?.total}
          onPageChange={(p) => setParams({ page: String(p) })}
        />
      </div>
    </>
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
  const { data: me } = useMe();
  const tx = useQuery({
    queryKey: [...qk.payments, "transactions", id],
    queryFn: () => api.get<TxDetail>(`/payments/transactions/${id}`),
  });
  const t = tx.data;

  if (tx.error)
    return (
      <>
        <BackLink href="/payments" label="Payments" />
        <ErrorState error={tx.error} title="Could not load this transaction" onRetry={() => tx.refetch()} />
      </>
    );

  const attemptCols: Column<Attempt>[] = [
    { key: "time", header: "Time", cell: (a) => <span className="num text-sm">{formatDateTime(a.created_at)}</span> },
    { key: "method", header: "Method", cell: (a) => <PaymentMethod token={a.payment_method} /> },
    { key: "outcome", header: "Outcome", cell: (a) => <StatusBadge status={a.outcome} /> },
    { key: "reason", header: "Failure reason", cell: (a) => (a.failure_reason ? humanize(a.failure_reason.toUpperCase()) : "-") },
    { key: "ref", header: "Provider ref", cell: (a) => <span className="num text-xs">{a.provider_reference ?? "-"}</span> },
  ];
  const pendingRefund = t?.refunds.some((r) => r.status === "PENDING_APPROVAL");
  const showRefund = t && t.status === "SUCCEEDED" && can(me, "payments:refund") && !pendingRefund;

  return (
    <>
      <BackLink href="/payments" label="Payments" />
      <PageHeader
        title={t ? <span className="num">{t.reference}</span> : <Skeleton className="h-8 w-48" />}
        description={t ? `${t.customer.full_name} · ${t.product.name}` : undefined}
        actions={
          t && (
            <>
              <StatusBadge status={t.status} />
              <SimulatedBadge />
            </>
          )
        }
      />
      <SimulatedBanner />
      {!t ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Section title="Payment">
              <DetailList>
                <Detail label="Amount">
                  <Money value={t.amount} currency={t.currency} className="text-2xl font-semibold" />
                </Detail>
                <Detail label="Status">
                  <StatusBadge status={t.status} />
                </Detail>
                <Detail label="Customer">
                  <Link href={`/customers/${t.customer.id}`} className="text-info-text hover:underline">
                    {t.customer.full_name}
                  </Link>
                </Detail>
                <Detail label="Product">
                  <Link href={`/products/${t.product.id}`} className="text-info-text hover:underline">
                    {t.product.name}
                  </Link>
                </Detail>
                <Detail label="Provider">
                  <span className="inline-flex items-center gap-2">
                    {t.provider} <SimulatedBadge />
                  </span>
                </Detail>
                <Detail label="Payment method">
                  <PaymentMethod token={t.payment_method} />
                </Detail>
                <Detail label="Order">
                  <Link href={`/orders/${t.order_id}`} className="text-info-text hover:underline">
                    View order
                  </Link>
                </Detail>
                <Detail label="Failure reason">{t.failure_reason ? humanize(t.failure_reason.toUpperCase()) : "-"}</Detail>
                <Detail label="Created">{formatDateTime(t.created_at)}</Detail>
                <Detail label="Completed">{formatDateTime(t.completed_at)}</Detail>
              </DetailList>
            </Section>
            <Section title="Attempts" description="Each call to the simulated provider.">
              <DataTable columns={attemptCols} rows={t.attempts} rowKey={(a) => a.id} emptyTitle="No attempts yet" />
            </Section>
            <Section title="Status history">
              <Timeline
                items={t.history.map((h) => ({
                  key: h.id,
                  at: h.created_at,
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      {h.from_status && (
                        <>
                          <StatusBadge status={h.from_status} />
                          <span aria-label="to">→</span>
                        </>
                      )}
                      <StatusBadge status={h.to_status} />
                    </span>
                  ),
                  meta: h.actor && <>by <span className="num">{h.actor}</span></>,
                  body: h.reason,
                }))}
              />
            </Section>
          </div>
          <div className="space-y-4">
            {showRefund && <RefundForm txId={t.id} />}
            {pendingRefund && (
              <p className="rounded-lg border border-warning/30 bg-warning/15 px-3 py-2 text-sm text-warning-text">
                A refund request is waiting for approval by another administrator.
              </p>
            )}
            <Section title="Security">
              <DetailList className="sm:grid-cols-1">
                <Detail label="Risk score">
                  <RiskScore score={t.risk_score} />
                </Detail>
                <Detail label="Risk flags">
                  {t.risk_flags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {t.risk_flags.map((f) => (
                        <span key={f} className="num rounded-md border bg-muted px-1.5 py-0.5 text-xs">
                          {f}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No flags</span>
                  )}
                </Detail>
              </DetailList>
              <h3 className="mt-5 mb-2 text-sm font-semibold">Linked security events</h3>
              {t.security_events.length ? (
                <ul className="space-y-2">
                  {t.security_events.map((e) => (
                    <li key={e.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={e.severity} />
                        <StatusBadge status={e.status} />
                        <span className="num text-xs text-muted-foreground">{e.event_type}</span>
                      </div>
                      <p className="mt-1.5 text-sm">{e.description}</p>
                      <Link href={`/security?event=${e.id}`} className="mt-1 inline-block text-sm text-info-text hover:underline">
                        Open in Security
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </Section>
            <Section title="Approvals">
              {t.approvals.length ? (
                <ul className="space-y-2">
                  {t.approvals.map((a) => (
                    <li key={a.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="text-sm font-medium">{humanize(a.action)}</span>
                        <TimeAgo date={a.created_at} className="text-xs text-muted-foreground" />
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{a.reason}</p>
                      <Link href={`/approvals/${a.id}`} className="mt-1 inline-block text-sm text-info-text hover:underline">
                        Open approval
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </Section>
            <Section title="Refunds">
              {t.refunds.length ? (
                <ul className="space-y-2">
                  {t.refunds.map((r) => (
                    <li key={r.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge status={r.status} />
                        <Money value={r.amount} />
                      </div>
                      <p className="mt-1.5 text-sm">{r.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requested {formatDateTime(r.created_at)}
                        {r.completed_at && `, completed ${formatDateTime(r.completed_at)}`}
                      </p>
                      {r.approval_id && (
                        <Link href={`/approvals/${r.approval_id}`} className="mt-1 inline-block text-sm text-info-text hover:underline">
                          Open approval
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </Section>
          </div>
        </div>
      )}
    </>
  );
}

const refundSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters").max(300, "300 characters max"),
});

function RefundForm({ txId }: { txId: string }) {
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
      toast.success("Refund needs approval by another administrator", {
        action: { label: "View approval", onClick: () => router.push(`/approvals/${approval.id}`) },
      });
    },
    onError: (err) => form.setError("root", { message: errorText(err) }),
  });

  return (
    <Section title="Request refund" description="Refunds are never immediate. Another administrator must approve.">
      <form onSubmit={form.handleSubmit((v) => refund.mutate(v.reason))} noValidate className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="refund-reason">Reason</Label>
          <Textarea
            id="refund-reason"
            rows={3}
            aria-invalid={!!errors.reason || undefined}
            aria-describedby={errors.reason ? "refund-reason-err" : undefined}
            {...form.register("reason")}
          />
          <FieldError id="refund-reason-err" message={errors.reason?.message} />
        </div>
        {errors.root && (
          <p role="alert" className="text-sm text-danger-text">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={refund.isPending} className="w-fit">
          {refund.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Request refund
        </Button>
      </form>
    </Section>
  );
}
