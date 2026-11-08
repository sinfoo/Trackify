"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Brain, CreditCard, GraduationCap, Loader2, MessageSquare, Mic, Pencil, RefreshCw, ShieldAlert, ShieldX, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AgentAvatar,
  BackLink,
  DetailItem,
  DetailList,
  DetailNotice,
  DetailPage,
  DetailSection,
  ErrorState,
  Facts,
  Money,
  StatusBadge,
  TimeAgo,
  humanize,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Customer, Insight, Order, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock, FieldError, actionBtn, agentTile, errorText, initialsOf, selectClass, serverFieldErrors } from "@/features/payments/shared";
import { SEGMENTS, Sentiment } from "./customers-view";

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
  const customer = useQuery({ queryKey: [...qk.customers, id], queryFn: () => api.get<Customer>(`/customers/${id}`) });
  const insights = useQuery({ queryKey: [...qk.customers, id, "insights"], queryFn: () => api.get<Insight[]>(`/customers/${id}/insights`) });
  const history = useQuery({ queryKey: [...qk.customers, id, "history"], queryFn: () => api.get<History>(`/customers/${id}/history`) });
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const canWrite = can(me, "customers:write");
  const canAnalyze = can(me, "agents:write");

  if (customer.error) {
    return (
      <>
        <BackLink href="/customers">All customers</BackLink>
        <ErrorState error={customer.error} title="Could not load this customer" onRetry={() => customer.refetch()} />
      </>
    );
  }
  const c = customer.data;
  const convs = history.data?.conversations ?? [];
  const latestConv = convs.at(-1);
  const flagged = convs.reduce((n, x) => n + x.flagged_count, 0);
  const latest = insights.data?.[0];

  return (
    <>
      <DetailPage
        back={{ href: "/customers", label: "All customers" }}
        eyebrow={c ? `Customer · ${c.segment ? humanize(c.segment.toUpperCase()) : "no segment"}` : "Customer"}
        title={c ? c.full_name : <Skeleton className="h-8 w-56" />}
        tile={{ initials: initialsOf(c?.full_name), color: "var(--text)", bg: "var(--panel3)" }}
        badge={c?.journey_stage ? <StatusBadge status={c.journey_stage} size="lg" /> : undefined}
        meta={c ? [<span key="m" className="mono">{c.email ?? "no email"}</span>, `Customer since ${formatDate(c.created_at)}`] : []}
        actions={
          <>
            {canWrite && c && (
              <Button variant="outline" className={actionBtn} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                <Pencil aria-hidden /> Edit profile
              </Button>
            )}
            {latestConv && (
              <Button className={actionBtn} onClick={() => setTranscriptId(latestConv.id)}>
                <MessageSquare aria-hidden /> Open conversation
              </Button>
            )}
          </>
        }
        notice={
          flagged > 0 ? (
            <DetailNotice icon={ShieldAlert} tone="warning" title="Security notice.">
              <span className="num">{flagged}</span> {flagged === 1 ? "message" : "messages"} in this customer&apos;s conversations {flagged === 1 ? "was" : "were"} blocked by the Security agent before reaching the Sales agent.
            </DetailNotice>
          ) : undefined
        }
        aside={
          <>
            <IntelligenceFacts query={insights} customer={c} interactions={convs.length} />
            {c && (
              <DetailSection
                title="Profile"
                actions={
                  canWrite && !editing ? (
                    <button type="button" className="text-xs font-bold text-brand-text hover:underline" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                  ) : undefined
                }
              >
                {editing ? (
                  <ProfileForm customer={c} onDone={() => setEditing(false)} />
                ) : (
                  <Facts
                    items={[
                      { k: "Full name", v: c.full_name },
                      { k: "Email", v: c.email ?? "—", mono: true },
                      { k: "Segment", v: c.segment ? humanize(c.segment.toUpperCase()) : "—" },
                      { k: "City", v: c.city ?? "—" },
                      { k: "Journey stage", v: c.journey_stage ? humanize(c.journey_stage) : "—" },
                      { k: "Customer since", v: formatDateTime(c.created_at) },
                      { k: "Orders", v: c.orders_count, mono: true },
                      { k: "Spent", v: <Money value={c.total_spent} />, mono: true },
                    ]}
                  />
                )}
              </DetailSection>
            )}
          </>
        }
      >
        <HistorySection query={history} canAnalyze={canAnalyze} customerId={id} onOpenTranscript={setTranscriptId} canPayments={can(me, "payments:read")} />
        {latest && (
          <DetailSection title="Latest analysis" count={<TimeAgo date={latest.updated_at} />}>
            <p className="mt-2 text-[13.5px] leading-normal text-t2">{latest.summary}</p>
            {latest.recommended_follow_up && (
              <div className="mt-3 rounded-[14px] bg-brand-bg px-3.5 py-3">
                <p className="eyebrow !text-brand-text">Suggested follow-up</p>
                <p className="mt-1 text-[13.5px] font-semibold">{latest.recommended_follow_up}</p>
              </div>
            )}
          </DetailSection>
        )}
      </DetailPage>
      <TranscriptSheet conversationId={transcriptId} onClose={() => setTranscriptId(null)} canAnalyze={canAnalyze} customerId={id} />
    </>
  );
}

// ---------------------------------------------------------------- profile form

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(120, "120 characters max"),
  segment: z.string().max(40),
  city: z.string().trim().max(80, "80 characters max"),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileForm({ customer: c, onDone }: { customer: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: c.full_name, segment: c.segment ?? "", city: c.city ?? "" },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: ProfileValues) =>
      api.patch<Customer>(`/customers/${c.id}`, { full_name: v.full_name, ...(v.segment ? { segment: v.segment } : {}), city: v.city || null }),
    onSuccess: (updated) => {
      qc.setQueryData([...qk.customers, c.id], updated);
      qc.invalidateQueries({ queryKey: [...qk.customers, "list"] });
      toast.success("Profile saved");
      onDone();
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      for (const [k, msg] of Object.entries(fields)) if (k in profileSchema.shape) form.setError(k as keyof ProfileValues, { message: msg });
      if (!Object.keys(fields).length) form.setError("root", { message: errorText(err) });
    },
  });
  const segments = c.segment && !SEGMENTS.includes(c.segment) ? [c.segment, ...SEGMENTS] : SEGMENTS;

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="mt-3 grid gap-3.5" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="p-name" className="text-[12.5px] font-bold text-t2">Full name</Label>
        <Input id="p-name" size="lg" aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? "p-name-err" : undefined} {...form.register("full_name")} />
        <FieldError id="p-name-err" message={errors.full_name?.message} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-segment" className="text-[12.5px] font-bold text-t2">Segment</Label>
        <select id="p-segment" className={cn(selectClass, "h-11")} {...form.register("segment")}>
          {!c.segment && <option value="">Not set</option>}
          {segments.map((s) => (
            <option key={s} value={s}>
              {humanize(s.toUpperCase())}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-city" className="text-[12.5px] font-bold text-t2">City</Label>
        <Input id="p-city" size="lg" aria-invalid={!!errors.city} aria-describedby={errors.city ? "p-city-err" : undefined} {...form.register("city")} />
        <FieldError id="p-city-err" message={errors.city?.message} />
      </div>
      {errors.root && (
        <p role="alert" className="rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
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

// ---------------------------------------------------------------- intelligence facts (Studio inspector look)

function IntelligenceFacts({ query, customer: c, interactions }: { query: UseQueryResult<Insight[]>; customer: Customer | undefined; interactions: number }) {
  const latest = query.data?.[0];
  const intent = latest?.purchase_intent ?? c?.purchase_intent ?? null;
  const pct = intent === null ? 0 : Math.round(intent * 100);
  const band = pct >= 70 ? "High" : pct >= 40 ? "Medium" : "Low";
  const color = pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
  return (
    <DetailSection title="Intelligence agent · estimates" actions={<AgentAvatar agentId="intelligence" size={24} />}>
      {query.isPending ? (
        <Skeleton className="mt-3 h-40" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-3" />
      ) : intent === null ? (
        <p className="mt-2 text-[13px] text-t3">No insight yet. It appears after the Intelligence agent analyses a conversation.</p>
      ) : (
        <>
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-t2">Purchase intent</span>
              <span className="num text-[22px] font-extrabold" style={{ color }}>
                {intent.toFixed(2)} <span className="text-xs font-bold text-t3">{band}</span>
              </span>
            </div>
            <div role="meter" aria-label="Purchase intent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}%, ${band}`} className="mt-2 h-2 overflow-hidden rounded-full bg-panel3">
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
          <Facts
            className="mt-3"
            items={[
              { k: "Sentiment", v: <Sentiment label={latest?.sentiment_label ?? c?.sentiment_label} /> },
              { k: "Journey stage", v: latest?.journey_stage ? humanize(latest.journey_stage) : c?.journey_stage ? humanize(c.journey_stage) : "—" },
              { k: "Interactions", v: interactions, mono: true },
              { k: "Spent", v: c ? <Money value={c.total_spent} /> : "—", mono: true },
              { k: "Needs", v: latest?.needs.length ? latest.needs.join(", ") : "none detected" },
              { k: "Motivations", v: latest?.motivations.length ? latest.motivations.join(", ") : "none detected" },
              { k: "Objections", v: latest?.objections.length ? latest.objections.join(", ") : c?.objections.length ? c.objections.join(", ") : "none" },
              { k: "Hesitation", v: latest?.hesitation ? "Customer is hesitating" : "none flagged" },
            ]}
          />
          {latest && (
            <p className="mt-3 flex items-start gap-2 text-xs leading-normal text-t3">
              <Brain aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                Model estimate, not verified fact. Confidence <span className="num font-bold">{formatPercent(latest.confidence, { digits: 0 })}</span> · source{" "}
                {latest.source === "llm" ? "LLM" : humanize(latest.source.toUpperCase())} · updated <TimeAgo date={latest.updated_at} />.
              </span>
            </p>
          )}
        </>
      )}
    </DetailSection>
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
  canPayments,
  customerId,
  onOpenTranscript,
}: {
  query: UseQueryResult<History>;
  canAnalyze: boolean;
  /** The API omits transactions without payments:read. */
  canPayments: boolean;
  customerId: string;
  onOpenTranscript: (id: string) => void;
}) {
  const router = useRouter();
  const analyze = useAnalyze(customerId);
  const h = query.data;
  const count = (n: number | undefined) => (n === undefined ? "" : ` ${n}`);
  const total = h ? h.conversations.length + h.orders.length + (canPayments ? h.transactions.length : 0) + h.enrollments.length : undefined;

  return (
    <DetailSection title="History" count={total}>
      {query.isPending ? (
        <Skeleton className="mt-3 h-48" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} className="mt-3" />
      ) : (
        <Tabs defaultValue="conversations" className="mt-3">
          <TabsList className="max-w-full flex-wrap" size="sm">
            <TabsTrigger value="conversations">Conversations{count(h?.conversations.length)}</TabsTrigger>
            <TabsTrigger value="orders">Orders{count(h?.orders.length)}</TabsTrigger>
            {canPayments && <TabsTrigger value="transactions">Transactions{count(h?.transactions.length)}</TabsTrigger>}
            <TabsTrigger value="enrollments">Enrollments{count(h?.enrollments.length)}</TabsTrigger>
          </TabsList>
          <TabsContent value="conversations">
            <DetailList empty="No conversations yet.">
              {h?.conversations.toReversed().map((x) => (
                <DetailItem
                  key={x.id}
                  icon={x.channel === "voice" ? Mic : MessageSquare}
                  {...agentTile("sales")}
                  title="Conversation with the sales assistant"
                  pill={
                    x.flagged_count > 0 ? (
                      <StatusBadge status="BLOCKED" label={`${x.flagged_count} blocked`} size="sm" />
                    ) : (
                      <span className="text-[11px] font-bold text-t3">{humanize(x.status)}</span>
                    )
                  }
                  sub={
                    <>
                      <span className="num">{x.messages_count}</span> messages · {humanize(x.channel.toUpperCase())}
                      {x.purchase_intent != null && (
                        <>
                          {" "}· intent <span className="num">{x.purchase_intent.toFixed(2)}</span>
                        </>
                      )}
                      {x.summary ? ` · ${x.summary}` : ""}
                    </>
                  }
                  time={<TimeAgo date={x.created_at} />}
                  actions={
                    <span className="flex shrink-0 gap-1">
                      <Button variant="outline" size="xs" onClick={() => onOpenTranscript(x.id)}>
                        Transcript
                      </Button>
                      {canAnalyze && (
                        <Button variant="ghost" size="xs" disabled={analyze.isPending} onClick={() => analyze.mutate(x.id)} aria-label="Re-analyze conversation">
                          <RefreshCw aria-hidden className={cn(analyze.isPending && analyze.variables === x.id && "animate-spin")} /> Re-analyze
                        </Button>
                      )}
                    </span>
                  }
                />
              ))}
            </DetailList>
          </TabsContent>
          <TabsContent value="orders">
            <DetailList empty="No orders yet.">
              {h?.orders.toReversed().map((o) => (
                <DetailItem
                  key={o.id}
                  icon={ShoppingCart}
                  {...agentTile("payment")}
                  title={o.items.map((i) => i.product_name).join(", ") || "Order"}
                  pill={<StatusBadge status={o.status} size="sm" />}
                  sub={
                    <>
                      {o.reference} · <Money value={o.total} currency={o.currency} />
                    </>
                  }
                  mono
                  time={<TimeAgo date={o.created_at} />}
                  actions={
                    <Button variant="outline" size="xs" onClick={() => router.push(`/orders/${o.id}`)}>
                      Open
                    </Button>
                  }
                />
              ))}
            </DetailList>
          </TabsContent>
          {canPayments && (
            <TabsContent value="transactions">
              <DetailList empty="No transactions yet.">
                {h?.transactions.toReversed().map((t) => (
                  <DetailItem
                    key={t.id}
                    icon={CreditCard}
                    {...agentTile("payment")}
                    title={t.product.name}
                    pill={<StatusBadge status={t.status} size="sm" />}
                    sub={
                      <>
                        {t.reference} · <Money value={t.amount} currency={t.currency} />
                        {t.risk_score != null && (
                          <>
                            {" "}· risk <span className="num">{Math.round(t.risk_score * 100)}</span>
                          </>
                        )}
                      </>
                    }
                    mono
                    time={<TimeAgo date={t.created_at} />}
                    actions={
                      <Button variant="outline" size="xs" onClick={() => router.push(`/payments/${t.id}`)}>
                        Open
                      </Button>
                    }
                  />
                ))}
              </DetailList>
            </TabsContent>
          )}
          <TabsContent value="enrollments">
            <DetailList empty="No enrollments yet.">
              {h?.enrollments.toReversed().map((e) => (
                <DetailItem
                  key={e.id}
                  icon={GraduationCap}
                  {...agentTile("intelligence")}
                  title={e.product.name}
                  pill={<StatusBadge status={e.status} size="sm" />}
                  sub="Enrollment"
                  time={<TimeAgo date={e.created_at} />}
                  actions={
                    <Button variant="outline" size="xs" onClick={() => router.push(`/orders/${e.order_id}`)}>
                      Order
                    </Button>
                  }
                />
              ))}
            </DetailList>
          </TabsContent>
        </Tabs>
      )}
    </DetailSection>
  );
}

// ---------------------------------------------------------------- transcript (Studio bubbles)

function TranscriptSheet({ conversationId, onClose, canAnalyze, customerId }: { conversationId: string | null; onClose: () => void; canAnalyze: boolean; customerId: string }) {
  const conv = useQuery({
    queryKey: [...qk.conversations, conversationId],
    queryFn: () => api.get<ConversationDetail>(`/conversations/${conversationId}`),
    enabled: !!conversationId,
  });
  const analyze = useAnalyze(customerId);
  const d = conv.data;
  const flagged = d?.messages.filter((m) => m.flagged).length ?? 0;

  return (
    <Sheet open={!!conversationId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-hair">
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
            <Button variant="outline" size="sm" className="mt-2 w-fit" disabled={analyze.isPending} onClick={() => analyze.mutate(conversationId)}>
              <RefreshCw aria-hidden className={cn(analyze.isPending && "animate-spin")} /> Re-analyze
            </Button>
          )}
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-label="Transcript">
          {flagged > 0 && (
            <DetailNotice icon={ShieldAlert} tone="danger" title="Prompt injection blocked.">
              <span className="num">{flagged}</span> {flagged === 1 ? "message was" : "messages were"} flagged by the Security agent and never reached the Sales agent.
            </DetailNotice>
          )}
          {conv.isPending ? <Skeleton className="h-40" /> : conv.error ? <ErrorState error={conv.error} onRetry={() => conv.refetch()} /> : d?.messages.map((m) => <Bubble key={m.id} m={m} />)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Bubble({ m }: { m: AdminMessage }) {
  const isCustomer = m.role === "customer";
  return (
    <div className={cn("flex items-end gap-2", isCustomer && "flex-row-reverse")}>
      {!isCustomer && <AgentAvatar agentId="sales" size={28} className="shrink-0" />}
      <div
        className={cn(
          "max-w-[85%] rounded-[16px] px-3.5 py-2.5 text-sm leading-normal",
          isCustomer ? "rounded-br-[6px] bg-bubble-me text-on-bubble-me" : "rounded-bl-[6px] bg-bubble text-text",
          m.flagged && "border border-danger bg-danger-bg text-danger",
        )}
      >
        {m.flagged && (
          <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-extrabold">
            <ShieldX aria-hidden className="size-3" /> Blocked by security
          </span>
        )}
        <p className="break-words whitespace-pre-wrap">{m.content}</p>
        <p className={cn("mt-1 text-[10.5px] opacity-70", isCustomer && "text-right")}>
          <Clock date={m.created_at} />
        </p>
      </div>
    </div>
  );
}
