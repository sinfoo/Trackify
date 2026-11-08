"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Bot, Loader2, MessageSquareText, Pencil, RefreshCw, ShieldX, TriangleAlert, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, ErrorState, Money, PageHeader, StatusBadge, TimeAgo, humanize, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Customer, Insight, Order, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BackLink,
  Detail,
  DetailList,
  FieldError,
  RiskScore,
  Section,
  errorText,
  selectClass,
  serverFieldErrors,
} from "@/features/payments/shared";
import { Chips, IntentBar, SEGMENTS, Sentiment } from "./customers-view";

// Admin shapes as served by apps/api/app/api/v1/common.py (differ slightly from lib/types Conversation/Enrollment).
interface AdminConversation {
  id: string;
  customer: { id: string; full_name: string };
  channel: string;
  status: string;
  summary: string | null;
  messages_count: number;
  flagged_count: number;
  purchase_intent: number | null;
  sentiment_label: string | null;
  created_at: string;
}
interface AdminMessage {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  flagged: boolean;
  meta: Record<string, unknown> | null;
  created_at: string;
}
interface ConversationDetail extends AdminConversation {
  messages: AdminMessage[];
  insight: Insight | null;
}
interface AdminEnrollment {
  id: string;
  status: string;
  product: { id: string; name: string };
  order_id: string;
  created_at: string;
}
interface History {
  conversations: AdminConversation[];
  orders: Order[];
  transactions: Transaction[];
  enrollments: AdminEnrollment[];
}

export function CustomerDetail({ id }: { id: string }) {
  const { data: me } = useMe();
  const customer = useQuery({
    queryKey: [...qk.customers, id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
  });
  const insights = useQuery({
    queryKey: [...qk.customers, id, "insights"],
    queryFn: () => api.get<Insight[]>(`/customers/${id}/insights`),
  });
  const history = useQuery({
    queryKey: [...qk.customers, id, "history"],
    queryFn: () => api.get<History>(`/customers/${id}/history`),
  });
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  if (customer.error) {
    return (
      <>
        <BackLink href="/customers" label="Customers" />
        <ErrorState error={customer.error} title="Could not load this customer" onRetry={() => customer.refetch()} />
      </>
    );
  }
  const c = customer.data;

  return (
    <>
      <BackLink href="/customers" label="Customers" />
      <PageHeader
        title={c ? c.full_name : <Skeleton className="h-8 w-56" />}
        description={c ? [c.email, c.city].filter(Boolean).join(" · ") || "No contact details" : undefined}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {c ? <ProfileCard customer={c} canWrite={can(me, "customers:write")} /> : <Skeleton className="h-64" />}
        <IntelligencePanel query={insights} />
      </div>
      <HistorySection
        query={history}
        canAnalyze={can(me, "agents:write")}
        customerId={id}
        onOpenTranscript={setTranscriptId}
      />
      <TranscriptSheet
        conversationId={transcriptId}
        onClose={() => setTranscriptId(null)}
        canAnalyze={can(me, "agents:write")}
        customerId={id}
      />
    </>
  );
}

// ---------------------------------------------------------------- profile

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120, "120 characters max"),
  segment: z.string().max(40),
  city: z.string().trim().max(80, "80 characters max"),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileCard({ customer: c, canWrite }: { customer: Customer; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Section
      title="Profile"
      actions={
        canWrite && !editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        ) : null
      }
    >
      {editing ? (
        <ProfileForm customer={c} onDone={() => setEditing(false)} />
      ) : (
        <DetailList>
          <Detail label="Full name">{c.full_name}</Detail>
          <Detail label="Email">{c.email ?? "-"}</Detail>
          <Detail label="Segment">{c.segment ? humanize(c.segment.toUpperCase()) : "-"}</Detail>
          <Detail label="City">{c.city ?? "-"}</Detail>
          <Detail label="Journey stage">{c.journey_stage ? humanize(c.journey_stage) : "-"}</Detail>
          <Detail label="Customer since">{formatDateTime(c.created_at)}</Detail>
          <Detail label="Orders">
            <span className="num">{c.orders_count}</span>
          </Detail>
          <Detail label="Total spent">
            <Money value={c.total_spent} />
          </Detail>
        </DetailList>
      )}
    </Section>
  );
}

function ProfileForm({ customer: c, onDone }: { customer: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: c.full_name, segment: c.segment ?? "", city: c.city ?? "" },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: ProfileValues) =>
      api.patch<Customer>(`/customers/${c.id}`, {
        full_name: v.full_name,
        ...(v.segment ? { segment: v.segment } : {}),
        city: v.city || null,
      }),
    onSuccess: (updated) => {
      qc.setQueryData([...qk.customers, c.id], updated);
      qc.invalidateQueries({ queryKey: [...qk.customers, "list"] });
      toast.success("Profile saved");
      onDone();
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      for (const [k, msg] of Object.entries(fields))
        if (k in profileSchema.shape) form.setError(k as keyof ProfileValues, { message: msg });
      if (!Object.keys(fields).length) form.setError("root", { message: errorText(err) });
    },
  });
  const segments = c.segment && !SEGMENTS.includes(c.segment) ? [c.segment, ...SEGMENTS] : SEGMENTS;

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="p-name">Full name</Label>
        <Input
          id="p-name"
          aria-invalid={!!errors.full_name}
          aria-describedby={errors.full_name ? "p-name-err" : undefined}
          {...form.register("full_name")}
        />
        <FieldError id="p-name-err" message={errors.full_name?.message} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-segment">Segment</Label>
        <select id="p-segment" className={selectClass} {...form.register("segment")}>
          {!c.segment && <option value="">Not set</option>}
          {segments.map((s) => (
            <option key={s} value={s}>
              {humanize(s.toUpperCase())}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-city">City</Label>
        <Input
          id="p-city"
          aria-invalid={!!errors.city}
          aria-describedby={errors.city ? "p-city-err" : undefined}
          {...form.register("city")}
        />
        <FieldError id="p-city-err" message={errors.city?.message} />
      </div>
      {errors.root && (
        <p role="alert" className="text-sm text-danger-text">
          {errors.root.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 aria-hidden className="animate-spin" />} Save
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- intelligence

function ListBlock({ label, items }: { label: string; items: string[] | null | undefined }) {
  return (
    <Detail label={label}>
      {items?.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-sm">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-muted-foreground">None detected</span>
      )}
    </Detail>
  );
}

function IntentGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const band = pct >= 70 ? "High" : pct >= 40 ? "Medium" : "Low";
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="num text-3xl font-semibold">{pct}%</span>
        <span className="text-sm text-muted-foreground">{band} intent</span>
      </div>
      <div
        role="meter"
        aria-label="Purchase intent"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, ${band}`}
        className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-info" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>0</span>
        <span>40</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  );
}

function IntelligencePanel({ query }: { query: UseQueryResult<Insight[]> }) {
  const latest = query.data?.[0];
  return (
    <Section
      title="Customer intelligence"
      description={
        latest ? (
          <>
            Latest insight, updated <TimeAgo date={latest.updated_at} />
          </>
        ) : undefined
      }
      actions={
        latest ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-muted px-2.5 text-xs font-medium">
            <Bot aria-hidden className="size-3.5" /> Source: {latest.source === "llm" ? "LLM" : humanize(latest.source.toUpperCase())}
          </span>
        ) : null
      }
    >
      {query.isPending ? (
        <Skeleton className="h-48" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !latest ? (
        <p className="text-sm text-muted-foreground">No insight yet. Insights appear after the intelligence agent analyzes a conversation.</p>
      ) : (
        <div className="space-y-5">
          <p className="rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-sm text-info-text">
            Model estimate, not verified fact. Confidence <span className="num">{formatPercent(latest.confidence, { digits: 0 })}</span>.
          </p>
          <p>{latest.summary}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <IntentGauge value={latest.purchase_intent} />
            <DetailList className="sm:grid-cols-1">
              <Detail label="Sentiment">
                <span className="inline-flex items-center gap-2">
                  <Sentiment label={latest.sentiment_label} />
                  <span className="num text-sm text-muted-foreground">
                    {latest.sentiment_score > 0 ? "+" : ""}
                    {latest.sentiment_score.toFixed(2)}
                  </span>
                </span>
              </Detail>
              <Detail label="Journey stage">{humanize(latest.journey_stage)}</Detail>
              <Detail label="Hesitation">
                {latest.hesitation ? (
                  <span className="inline-flex items-center gap-1.5 text-warning-text">
                    <TriangleAlert aria-hidden className="size-4" />
                    {/* backend sends a boolean; contract says string */}
                    {typeof latest.hesitation === "string" ? latest.hesitation : "Customer is hesitating"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No hesitation flagged</span>
                )}
              </Detail>
            </DetailList>
          </div>
          <DetailList>
            <ListBlock label="Needs" items={latest.needs} />
            <ListBlock label="Motivations" items={latest.motivations} />
            <ListBlock label="Interests" items={latest.interests} />
            <Detail label="Objections">
              <Chips items={latest.objections} max={6} />
            </Detail>
          </DetailList>
          <Detail label="Recommended follow-up">{latest.recommended_follow_up ?? "-"}</Detail>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- history

function useAnalyze(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => api.post<Insight | null>(`/conversations/${conversationId}/analyze`),
    onSuccess: (_, conversationId) => {
      qc.invalidateQueries({ queryKey: [...qk.customers, customerId] });
      qc.invalidateQueries({ queryKey: [...qk.conversations, conversationId] });
      toast.success("Conversation re-analyzed");
    },
    onError: (err) => toast.error(`Analysis failed: ${errorText(err)}`),
  });
}

function HistorySection({
  query,
  canAnalyze,
  customerId,
  onOpenTranscript,
}: {
  query: UseQueryResult<History>;
  canAnalyze: boolean;
  customerId: string;
  onOpenTranscript: (id: string) => void;
}) {
  const analyze = useAnalyze(customerId);
  const h = query.data;
  const { data: me } = useMe();
  const canPayments = can(me, "payments:read"); // the API omits transactions without it

  const convCols: Column<AdminConversation>[] = [
    { key: "date", header: "Started", cell: (x) => <TimeAgo date={x.created_at} /> },
    { key: "channel", header: "Channel", cell: (x) => humanize(x.channel.toUpperCase()) },
    {
      key: "messages",
      header: "Messages",
      cell: (x) => (
        <span className="inline-flex items-center gap-2">
          <span className="num">{x.messages_count}</span>
          {x.flagged_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger/12 px-2 text-xs text-danger-text">
              <ShieldX aria-hidden className="size-3" /> <span className="num">{x.flagged_count}</span> blocked
            </span>
          )}
        </span>
      ),
    },
    { key: "intent", header: "Intent", cell: (x) => <IntentBar value={x.purchase_intent} /> },
    // Conversation OPEN/CLOSED is not a security status; plain text avoids the red security "Open" pill.
    { key: "status", header: "Status", cell: (x) => humanize(x.status) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (x) => (
        <span className="inline-flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onOpenTranscript(x.id)}>
            <MessageSquareText aria-hidden /> Transcript
          </Button>
          {canAnalyze && (
            <Button
              variant="ghost"
              size="sm"
              disabled={analyze.isPending}
              onClick={() => analyze.mutate(x.id)}
            >
              <RefreshCw aria-hidden className={cn(analyze.isPending && analyze.variables === x.id && "animate-spin")} />
              Re-analyze
            </Button>
          )}
        </span>
      ),
    },
  ];
  const orderCols: Column<Order>[] = [
    {
      key: "ref",
      header: "Reference",
      cell: (o) => (
        <Link href={`/orders/${o.id}`} className="num text-info-text hover:underline">
          {o.reference}
        </Link>
      ),
    },
    { key: "items", header: "Items", cell: (o) => o.items.map((i) => i.product_name).join(", ") },
    { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
    { key: "total", header: "Total", align: "right", cell: (o) => <Money value={o.total} currency={o.currency} /> },
    { key: "date", header: "Created", cell: (o) => <TimeAgo date={o.created_at} /> },
  ];
  const txCols: Column<Transaction>[] = [
    {
      key: "ref",
      header: "Reference",
      cell: (t) => (
        <Link href={`/payments/${t.id}`} className="num text-info-text hover:underline">
          {t.reference}
        </Link>
      ),
    },
    { key: "product", header: "Product", cell: (t) => t.product.name },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    { key: "risk", header: "Risk", cell: (t) => <RiskScore score={t.risk_score} /> },
    { key: "amount", header: "Amount", align: "right", cell: (t) => <Money value={t.amount} currency={t.currency} /> },
    { key: "date", header: "Created", cell: (t) => <TimeAgo date={t.created_at} /> },
  ];
  const enrCols: Column<AdminEnrollment>[] = [
    { key: "product", header: "Product", cell: (e) => e.product.name },
    { key: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
    {
      key: "order",
      header: "Order",
      cell: (e) => (
        <Link href={`/orders/${e.order_id}`} className="text-info-text hover:underline">
          View order
        </Link>
      ),
    },
    { key: "date", header: "Created", cell: (e) => <TimeAgo date={e.created_at} /> },
  ];

  const common = { loading: query.isPending, error: query.error, onRetry: () => query.refetch() };
  const count = (n: number | undefined) => (n === undefined ? "" : ` (${n})`);

  return (
    <Section title="History" className="mt-4">
      <Tabs defaultValue="conversations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="conversations">Conversations{count(h?.conversations.length)}</TabsTrigger>
          <TabsTrigger value="orders">Orders{count(h?.orders.length)}</TabsTrigger>
          {canPayments && <TabsTrigger value="transactions">Transactions{count(h?.transactions.length)}</TabsTrigger>}
          <TabsTrigger value="enrollments">Enrollments{count(h?.enrollments.length)}</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="mt-3">
          <DataTable {...common} columns={convCols} rows={h?.conversations.toReversed()} rowKey={(x) => x.id} emptyTitle="No conversations" />
        </TabsContent>
        <TabsContent value="orders" className="mt-3">
          <DataTable {...common} columns={orderCols} rows={h?.orders.toReversed()} rowKey={(x) => x.id} emptyTitle="No orders" />
        </TabsContent>
        <TabsContent value="transactions" className="mt-3">
          <DataTable {...common} columns={txCols} rows={h?.transactions.toReversed()} rowKey={(x) => x.id} emptyTitle="No transactions" />
        </TabsContent>
        <TabsContent value="enrollments" className="mt-3">
          <DataTable {...common} columns={enrCols} rows={h?.enrollments.toReversed()} rowKey={(x) => x.id} emptyTitle="No enrollments" />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

// ---------------------------------------------------------------- transcript

function TranscriptSheet({
  conversationId,
  onClose,
  canAnalyze,
  customerId,
}: {
  conversationId: string | null;
  onClose: () => void;
  canAnalyze: boolean;
  customerId: string;
}) {
  const conv = useQuery({
    queryKey: [...qk.conversations, conversationId],
    queryFn: () => api.get<ConversationDetail>(`/conversations/${conversationId}`),
    enabled: !!conversationId,
  });
  const analyze = useAnalyze(customerId);
  const d = conv.data;

  return (
    <Sheet open={!!conversationId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Conversation transcript</SheetTitle>
          <SheetDescription>
            {d ? (
              <>
                {humanize(d.channel.toUpperCase())} · <span className="num">{d.messages_count}</span> messages · {formatDateTime(d.created_at)}
              </>
            ) : (
              "Loading"
            )}
          </SheetDescription>
          {canAnalyze && conversationId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-fit"
              disabled={analyze.isPending}
              onClick={() => analyze.mutate(conversationId)}
            >
              <RefreshCw aria-hidden className={cn(analyze.isPending && "animate-spin")} /> Re-analyze
            </Button>
          )}
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {conv.isPending ? (
            <Skeleton className="h-40" />
          ) : conv.error ? (
            <ErrorState error={conv.error} onRetry={() => conv.refetch()} />
          ) : (
            d?.messages.map((m) => <TranscriptMessage key={m.id} m={m} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TranscriptMessage({ m }: { m: AdminMessage }) {
  const isCustomer = m.role === "customer";
  const Icon = isCustomer ? UserIcon : Bot;
  return (
    <div className={cn("flex gap-2", isCustomer && "flex-row-reverse")}>
      <span
        aria-hidden
        className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Icon className="size-3.5" />
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
          isCustomer ? "bg-muted" : "bg-card",
          m.flagged && "border-danger/40 bg-danger/5",
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{humanize(m.role.toUpperCase())}</span>
          <time dateTime={m.created_at} className="num">
            {formatDateTime(m.created_at)}
          </time>
          {m.flagged && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger/25 bg-danger/12 px-2 font-medium text-danger-text">
              <ShieldX aria-hidden className="size-3" /> Blocked by security
            </span>
          )}
        </div>
        <p className={cn("break-words whitespace-pre-wrap", m.flagged && "text-muted-foreground")}>{m.content}</p>
      </div>
    </div>
  );
}
