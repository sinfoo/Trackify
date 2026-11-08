"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Package, Pencil, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, DetailItem, DetailList, DetailPage, DetailSection, ErrorState, FactChips, Facts, Money, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Order, Paged, Product } from "@/lib/types";
import { actionBtn, agentTile } from "@/features/payments/shared";
import { ProductModal } from "./product-form";
import { ArchiveButton, Seats } from "./products-view";

// services/analytics.py products()
interface ProductPerformance {
  product_id: string;
  revenue: string;
  sales: number;
  failed: number;
  payment_success_rate: number | null;
  seats_taken: number;
  seats_total: number;
}

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const product = useQuery({ queryKey: [...qk.products, id], queryFn: () => api.get<Product>(`/products/${id}`) });
  const perf = useQuery({
    queryKey: [...qk.analytics, "products", id],
    queryFn: () => api.get<ProductPerformance[]>("/analytics/products", { query: { product_id: id } }),
    select: (rows) => rows.find((r) => r.product_id === id) ?? rows[0],
    enabled: can(me, "analytics:read"),
  });
  // ponytail: /orders has no product filter; scan the latest page client-side (catalogue-sized data).
  const orders = useQuery({
    queryKey: [...qk.orders, "by-product", id],
    queryFn: () => api.get<Paged<Order>>("/orders", { query: { page_size: 100 } }),
    select: (d) => d.items.filter((o) => o.items.some((i) => i.product_id === id)).slice(0, 8),
    enabled: can(me, "orders:read"),
  });
  const p = product.data;
  const canWrite = can(me, "products:write");

  if (product.error)
    return (
      <>
        <BackLink href="/products">All products</BackLink>
        <ErrorState error={product.error} title="Could not load this program" onRetry={() => product.refetch()} />
      </>
    );

  const sales = perf.data?.sales ?? p?.stats.sales;

  return (
    <>
      <DetailPage
        back={{ href: "/products", label: "All products" }}
        eyebrow={p ? `Program · ${p.category}` : "Program"}
        title={p ? p.name : <Skeleton className="h-8 w-64" />}
        tile={{ icon: Package, ...agentTile("sales") }}
        badge={p && <StatusBadge status={p.status} size="lg" />}
        meta={
          p
            ? [
                <span key="l">
                  {p.level} · <span className="num">{p.duration_weeks}</span> weeks
                </span>,
                <span key="s" className="mono">
                  /offers/{p.slug}
                </span>,
              ]
            : []
        }
        actions={
          p && (
            <>
              <Button asChild variant="outline" className={actionBtn}>
                <Link href={`/offers/${p.slug}`}>
                  <ExternalLink aria-hidden /> View public page
                </Link>
              </Button>
              {canWrite && <ArchiveButton product={p} size="default" onDone={() => router.push("/products")} />}
              {canWrite && (
                <Button className={actionBtn} onClick={() => setEditing(true)}>
                  <Pencil aria-hidden /> Edit program
                </Button>
              )}
            </>
          )
        }
        aside={
          <DetailSection title="Offer">
            {p ? (
              <>
                <Facts
                  items={[
                    { k: "Price", v: <Money value={p.price} currency={p.currency} />, mono: true },
                    { k: "Seats", v: <Seats taken={p.stats.seats_taken} total={p.seats_total} /> },
                    { k: "Seats left", v: `${p.seats_left} of ${p.seats_total}`, mono: true },
                    { k: "Duration", v: `${p.duration_weeks} weeks` },
                    { k: "Level", v: p.level },
                    { k: "Sales", v: sales ?? "—", mono: true },
                    { k: "Revenue", v: <Money value={perf.data?.revenue ?? p.stats.revenue} currency={p.currency} />, mono: true },
                    ...(perf.data
                      ? [
                          { k: "Failed payments", v: perf.data.failed, mono: true },
                          { k: "Payment success", v: formatPercent(perf.data.payment_success_rate, { fromRatio: false }), mono: true },
                        ]
                      : []),
                    { k: "Created", v: formatDateTime(p.created_at) },
                    { k: "Updated", v: formatDateTime(p.updated_at) },
                  ]}
                />
                <FactChips title="Keywords the Sales agent matches" chips={p.keywords.map((k) => ({ label: k }))} />
              </>
            ) : (
              <Skeleton className="mt-3 h-64" />
            )}
          </DetailSection>
        }
      >
        {p ? (
          <>
            <DetailSection title="Summary">
              <p className="mt-2 text-[13.5px] leading-normal text-t2">{p.summary || "—"}</p>
              {p.description && <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-t3">{p.description}</p>}
            </DetailSection>
            <DetailSection title="Learning outcomes" count={p.learning_outcomes.length}>
              <DetailList empty="No outcomes listed yet.">
                {p.learning_outcomes.map((o) => (
                  <DetailItem key={o} icon={Check} {...agentTile("intelligence")} title={o} />
                ))}
              </DetailList>
            </DetailSection>
            <DetailSection title="Who it is for">
              <p className="mt-2 text-[13.5px] leading-normal text-t2">{p.target_audience || "—"}</p>
            </DetailSection>
            {orders.fetchStatus !== "idle" || orders.data ? (
              <DetailSection title="Recent orders" count={orders.data?.length}>
                {orders.isPending ? (
                  <Skeleton className="mt-3 h-24" />
                ) : (
                  <DetailList empty="No orders for this program yet.">
                    {orders.data?.map((o) => (
                      <DetailItem
                        key={o.id}
                        icon={ShoppingCart}
                        {...agentTile("payment")}
                        title={o.customer.full_name}
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
                )}
              </DetailSection>
            ) : null}
          </>
        ) : (
          <Skeleton className="h-80" />
        )}
      </DetailPage>
      {p && canWrite && <ProductModal open={editing} product={p} onOpenChange={setEditing} />}
    </>
  );
}
