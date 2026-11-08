"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CreditCard, GraduationCap, Package, ShoppingCart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  DataTable,
  DetailItem,
  DetailList,
  DetailPage,
  DetailSection,
  ErrorState,
  Facts,
  Money,
  PageTitle,
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
import { Clock, FilterChip, ListPage, Toolbar, WhoCell, actionBtn, agentTile, initialsOf, tighten, useUrlParams } from "@/features/payments/shared";

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

const itemsLabel = (o: Order) => o.items.map((i) => (i.quantity > 1 ? `${i.product_name} ×${i.quantity}` : i.product_name)).join(", ");

const columns: Column<Order>[] = [
  { key: "ref", header: "Order", cell: (o) => <span className="num text-[13px] font-semibold">{o.reference}</span> },
  { key: "customer", header: "Customer", cell: (o) => <WhoCell initials={initialsOf(o.customer.full_name)} title={o.customer.full_name} /> },
  { key: "items", header: "Program", cell: (o) => <span className="block max-w-[320px] truncate text-[13.5px] font-semibold">{itemsLabel(o)}</span> },
  {
    key: "status",
    header: "Status",
    cell: (o) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <StatusBadge status={o.status} className="h-6 px-[9px]" />
        {o.transaction && o.transaction.status !== "SUCCEEDED" && <StatusBadge status={o.transaction.status} size="sm" />}
      </span>
    ),
  },
  { key: "total", header: "Amount", align: "right", cell: (o) => <Money value={o.total} currency={o.currency} className="text-[13px] font-semibold" /> },
  { key: "date", header: "Placed", align: "right", cell: (o) => <TimeAgo date={o.created_at} className="text-[12.5px] font-medium text-t3" /> },
];

export function OrdersView() {
  const router = useRouter();
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const list = useQuery({
    queryKey: [...qk.orders, "list", { status, page }],
    queryFn: () => api.get<Paged<Order>>("/orders", { query: { status, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <ListPage>
      <PageTitle title="Orders" description="Orders and enrollments opened by the Payment agent on behalf of customers." />
      <Toolbar>
        <FilterChip selected={!status} onClick={() => setParams({ status: null })} count={!status ? list.data?.total : undefined}>
          All
        </FilterChip>
        {ORDER_STATUSES.map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => setParams({ status: s })} count={status === s ? list.data?.total : undefined}>
            {humanize(s)}
          </FilterChip>
        ))}
      </Toolbar>
      <DataTable
        columns={tighten(columns)}
        rows={list.data?.items}
        rowKey={(o) => o.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle="No orders"
        emptyDescription={status ? "Change the filters or run a scenario from Demo control." : "Orders appear when a customer enrolls."}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        page={list.data?.page ?? page}
        pageSize={list.data?.page_size ?? PAGE_SIZE}
        total={list.data?.total}
        onPageChange={(p) => setParams({ page: String(p) })}
        minWidth={860}
      />
    </ListPage>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
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
  const canPayments = can(me, "payments:read");

  if (order.error)
    return (
      <>
        <BackLink href="/orders">All orders</BackLink>
        <ErrorState error={order.error} title="Could not load this order" onRetry={() => order.refetch()} />
      </>
    );

  return (
    <DetailPage
      back={{ href: "/orders", label: "All orders" }}
      eyebrow="Order"
      title={o ? <span className="num">{o.reference}</span> : <Skeleton className="h-8 w-48" />}
      tile={{ icon: ShoppingCart, ...agentTile("payment") }}
      badge={o && <StatusBadge status={o.status} size="lg" />}
      meta={o ? [o.customer.full_name, `Placed ${formatDateTime(o.created_at)}`] : []}
      actions={
        o && (
          <>
            <Button asChild variant="outline" className={actionBtn}>
              <Link href={`/customers/${o.customer.id}`}>
                <User aria-hidden /> Open customer
              </Link>
            </Button>
            {o.transaction && canPayments && (
              <Button asChild className={actionBtn}>
                <Link href={`/payments/${o.transaction.id}`}>
                  <CreditCard aria-hidden /> Open payment
                </Link>
              </Button>
            )}
          </>
        )
      }
      aside={
        <DetailSection title="Summary" actions={<SimulatedBadge className="h-7 text-xs" />}>
          {o ? (
            <Facts
              items={[
                { k: "Program", v: itemsLabel(o) },
                { k: "Amount", v: <Money value={o.total} currency={o.currency} />, mono: true },
                { k: "Customer", v: o.customer.full_name },
                {
                  k: "Payment",
                  v: o.transaction ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <StatusBadge status={o.transaction.status} size="sm" />
                      {canPayments ? (
                        <Link href={`/payments/${o.transaction.id}`} className="num text-brand-text hover:underline">
                          {o.transaction.reference}
                        </Link>
                      ) : (
                        <span className="num">{o.transaction.reference}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-t3">No payment yet</span>
                  ),
                },
                {
                  k: "Enrollment",
                  v: enrollments.isPending && customerId ? (
                    <Skeleton className="ml-auto h-5 w-24" />
                  ) : enrollments.error ? (
                    <span className="text-t3">Unavailable</span>
                  ) : enrollments.data?.length ? (
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      {enrollments.data.map((e) => (
                        <StatusBadge key={e.id} status={e.status} size="sm" />
                      ))}
                    </span>
                  ) : (
                    <span className="text-t3">No enrollment</span>
                  ),
                },
                { k: "Created by", v: "Payment agent" },
                { k: "Created", v: formatDateTime(o.created_at) },
              ]}
            />
          ) : (
            <Skeleton className="mt-3 h-56" />
          )}
        </DetailSection>
      }
    >
      {!o ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <DetailSection title="Items" count={o.items.length}>
            <DetailList>
              {o.items.map((i) => (
                <DetailItem
                  key={i.product_id}
                  icon={Package}
                  {...agentTile("sales")}
                  title={i.product_name}
                  sub={
                    <>
                      <span className="num">{i.quantity}</span> × <Money value={i.unit_price} currency={o.currency} />
                    </>
                  }
                  actions={
                    <Button variant="outline" size="xs" onClick={() => router.push(`/products/${i.product_id}`)}>
                      Program
                    </Button>
                  }
                />
              ))}
            </DetailList>
          </DetailSection>
          <DetailSection title="Timeline" count={o.timeline.length}>
            <DetailList empty="No events yet.">
              {o.timeline.map((t, i) => (
                <DetailItem
                  key={`${i}-${t.created_at}`}
                  icon={t.type === "order.created" ? ShoppingCart : t.type.startsWith("enrollment") ? GraduationCap : CreditCard}
                  {...agentTile(t.type === "order.created" ? "orchestrator" : "payment")}
                  title={t.type === "order.created" ? "Order created" : t.from_status ? `${humanize(t.from_status)} → ${humanize(t.status)}` : "Payment status"}
                  pill={<StatusBadge status={t.status} size="sm" />}
                  sub={[t.note, t.actor && `by ${t.actor}`].filter(Boolean).join(" · ") || undefined}
                  time={<Clock date={t.created_at} />}
                />
              ))}
            </DetailList>
          </DetailSection>
        </>
      )}
    </DetailPage>
  );
}
