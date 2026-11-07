"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, KpiCard, Money, PageHeader, StatusBadge } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { BackLink, Detail, DetailList, Section } from "@/features/payments/shared";
import { Chips } from "@/features/customers/customers-view";
import { ProductSheet } from "./product-form";
import { Seats } from "./products-view";

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
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const product = useQuery({ queryKey: [...qk.products, id], queryFn: () => api.get<Product>(`/products/${id}`) });
  const perf = useQuery({
    queryKey: [...qk.analytics, "products", id],
    queryFn: () => api.get<ProductPerformance[]>("/analytics/products", { query: { product_id: id } }),
    select: (rows) => rows.find((r) => r.product_id === id) ?? rows[0],
    enabled: can(me, "analytics:read"),
  });
  const p = product.data;

  if (product.error)
    return (
      <>
        <BackLink href="/products" label="Products" />
        <ErrorState error={product.error} title="Could not load this product" onRetry={() => product.refetch()} />
      </>
    );

  return (
    <>
      <BackLink href="/products" label="Products" />
      <PageHeader
        title={p ? p.name : <Skeleton className="h-8 w-64" />}
        description={p?.summary}
        actions={
          <>
            {p && <StatusBadge status={p.status} />}
            {p && can(me, "products:write") && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Revenue" loading={!p} value={<Money value={perf.data?.revenue ?? p?.stats.revenue} />} definition="Sum of succeeded transactions for this product." />
        <KpiCard label="Sales" loading={!p} value={perf.data?.sales ?? p?.stats.sales} definition="Count of succeeded transactions." />
        <KpiCard label="Failed payments" loading={perf.isPending && perf.fetchStatus !== "idle"} value={perf.data?.failed ?? "-"} />
        <KpiCard
          label="Payment success rate"
          loading={perf.isPending && perf.fetchStatus !== "idle"}
          value={formatPercent(perf.data?.payment_success_rate, { fromRatio: false })}
          definition="Succeeded and refunded over all completed attempts."
        />
      </div>
      {p ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Section title="Details">
            <DetailList>
              <Detail label="Slug">
                <span className="num">{p.slug}</span>
              </Detail>
              <Detail label="Category">{p.category}</Detail>
              <Detail label="Price">
                <Money value={p.price} currency={p.currency} />
              </Detail>
              <Detail label="Duration">
                <span className="num">{p.duration_weeks}</span> weeks · {p.level}
              </Detail>
              <Detail label="Target audience" className="sm:col-span-2">
                {p.target_audience || "-"}
              </Detail>
              <Detail label="Description" className="sm:col-span-2">
                <p className="whitespace-pre-wrap">{p.description || "-"}</p>
              </Detail>
              <Detail label="Learning outcomes" className="sm:col-span-2">
                {p.learning_outcomes.length ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {p.learning_outcomes.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                ) : (
                  "-"
                )}
              </Detail>
              <Detail label="Keywords" className="sm:col-span-2">
                <Chips items={p.keywords} max={12} />
              </Detail>
            </DetailList>
          </Section>
          <Section title="Capacity">
            <Seats taken={p.stats.seats_taken} total={p.seats_total} />
            <DetailList className="mt-4 sm:grid-cols-1">
              <Detail label="Seats left">
                <span className="num">{p.seats_left}</span>
              </Detail>
              <Detail label="Created">{formatDateTime(p.created_at)}</Detail>
              <Detail label="Last updated">{formatDateTime(p.updated_at)}</Detail>
            </DetailList>
          </Section>
        </div>
      ) : (
        <Skeleton className="h-80" />
      )}
      {p && <ProductSheet open={editing} product={p} onOpenChange={setEditing} />}
    </>
  );
}
