"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTable,
  ErrorState,
  Money,
  PageHeader,
  SimulatedBadge,
  StatusBadge,
  TimeAgo,
  humanize,
  type Column,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Order, Paged } from "@/lib/types";
import { BackLink, Detail, DetailList, Section, Timeline, useUrlParams } from "@/features/payments/shared";

const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "CANCELLED", "REFUNDED"];
const PAGE_SIZE = 25;

// apps/api/app/api/v1/orders.py get_order
interface OrderTimelineEntry {
  type: string;
  status: string;
  from_status?: string | null;
  actor: string | null;
  note: string | null;
  created_at: string;
}
interface OrderDetailData extends Order {
  conversation_id: string | null;
  timeline: OrderTimelineEntry[];
}
interface AdminEnrollment {
  id: string;
  status: string;
  product: { id: string; name: string };
  order_id: string;
  created_at: string;
}

const itemsLabel = (o: Order) =>
  o.items.map((i) => (i.quantity > 1 ? `${i.product_name} x${i.quantity}` : i.product_name)).join(", ");

const columns: Column<Order>[] = [
  {
    key: "ref",
    header: "Reference",
    cell: (o) => (
      <Link href={`/orders/${o.id}`} className="num font-medium text-info-text hover:underline">
        {o.reference}
      </Link>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    cell: (o) => (
      <Link href={`/customers/${o.customer.id}`} className="hover:underline">
        {o.customer.full_name}
      </Link>
    ),
  },
  { key: "items", header: "Items", cell: (o) => <span className="line-clamp-2 min-w-32">{itemsLabel(o)}</span> },
  { key: "total", header: "Total", align: "right", cell: (o) => <Money value={o.total} currency={o.currency} /> },
  { key: "status", header: "Order status", cell: (o) => <StatusBadge status={o.status} /> },
  {
    key: "payment",
    header: "Payment",
    cell: (o) => (o.transaction ? <StatusBadge status={o.transaction.status} /> : <span className="text-muted-foreground">No payment yet</span>),
  },
  { key: "date", header: "Created", cell: (o) => <TimeAgo date={o.created_at} /> },
];

export function OrdersView() {
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const list = useQuery({
    queryKey: [...qk.orders, "list", { status, page }],
    queryFn: () => api.get<Paged<Order>>("/orders", { query: { status, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Orders" description="Orders, enrollments and their payment status." />
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <Tabs value={status || "ALL"} onValueChange={(v) => setParams({ status: v === "ALL" ? null : v })}>
            <TabsList aria-label="Filter by order status">
              <TabsTrigger value="ALL">All</TabsTrigger>
              {ORDER_STATUSES.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {humanize(s)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(o) => o.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          emptyTitle="No orders"
          emptyDescription={status ? "No order has this status." : "Orders appear when a customer enrolls."}
          page={list.data?.page ?? page}
          pageSize={list.data?.page_size ?? PAGE_SIZE}
          total={list.data?.total}
          onPageChange={(p) => setParams({ page: String(p) })}
        />
      </div>
    </>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { data: me } = useMe();
  const order = useQuery({ queryKey: [...qk.orders, id], queryFn: () => api.get<OrderDetailData>(`/orders/${id}`) });
  const o = order.data;
  const customerId = o?.customer.id;
  const enrollments = useQuery({
    queryKey: [...qk.orders, id, "enrollments", customerId],
    // /enrollments has no order_id filter (contract mentions one); narrow by customer server-side, then by order here.
    queryFn: () => api.get<Paged<AdminEnrollment>>("/enrollments", { query: { customer_id: customerId, page_size: 200 } }),
    select: (d) => d.items.filter((e) => e.order_id === id),
    enabled: !!customerId,
  });

  if (order.error)
    return (
      <>
        <BackLink href="/orders" label="Orders" />
        <ErrorState error={order.error} title="Could not load this order" onRetry={() => order.refetch()} />
      </>
    );

  return (
    <>
      <BackLink href="/orders" label="Orders" />
      <PageHeader
        title={o ? <span className="num">{o.reference}</span> : <Skeleton className="h-8 w-48" />}
        description={o ? `Created ${formatDateTime(o.created_at)}` : undefined}
        actions={o && <StatusBadge status={o.status} />}
      />
      {!o ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Customer and items">
            <DetailList>
              <Detail label="Customer">
                <Link href={`/customers/${o.customer.id}`} className="text-info-text hover:underline">
                  {o.customer.full_name}
                </Link>
              </Detail>
              <Detail label="Total">
                <Money value={o.total} currency={o.currency} className="text-lg font-semibold" />
              </Detail>
            </DetailList>
            <ul className="mt-4 divide-y rounded-lg border">
              {o.items.map((i) => (
                <li key={i.product_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <Link href={`/products/${i.product_id}`} className="font-medium hover:underline">
                    {i.product_name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    <span className="num">{i.quantity}</span> x <Money value={i.unit_price} currency={o.currency} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Payment and enrollment" actions={<SimulatedBadge />}>
            <DetailList>
              <Detail label="Payment">
                {o.transaction ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={o.transaction.status} />
                    {can(me, "payments:read") ? (
                      <Link href={`/payments/${o.transaction.id}`} className="num text-sm text-info-text hover:underline">
                        {o.transaction.reference}
                      </Link>
                    ) : (
                      <span className="num text-sm">{o.transaction.reference}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No payment yet</span>
                )}
              </Detail>
              <Detail label="Enrollment">
                {enrollments.isPending ? (
                  <Skeleton className="h-6 w-24" />
                ) : enrollments.error ? (
                  <span className="text-sm text-muted-foreground">Unavailable</span>
                ) : enrollments.data?.length ? (
                  <span className="flex flex-wrap gap-2">
                    {enrollments.data.map((e) => (
                      <StatusBadge key={e.id} status={e.status} label={`${humanize(e.status)}: ${e.product.name}`} />
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No enrollment</span>
                )}
              </Detail>
            </DetailList>
          </Section>
          <Section title="Timeline" className="lg:col-span-2">
            <Timeline
              items={o.timeline.map((t, i) => ({
                key: `${i}-${t.created_at}`,
                at: t.created_at,
                title: (
                  <span className="flex flex-wrap items-center gap-2">
                    {t.from_status && (
                      <>
                        <StatusBadge status={t.from_status} />
                        <span aria-label="to">→</span>
                      </>
                    )}
                    <StatusBadge status={t.status} />
                  </span>
                ),
                meta: [t.type === "order.created" ? "Order created" : "Payment status", t.actor && `by ${t.actor}`]
                  .filter(Boolean)
                  .join(" "),
                body: t.note,
              }))}
            />
          </Section>
        </div>
      )}
    </>
  );
}
