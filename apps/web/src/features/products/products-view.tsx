"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, Money, PageHeader, StatusBadge, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { errorText, useUrlParams } from "@/features/payments/shared";
import { PRODUCT_STATUSES, ProductSheet } from "./product-form";

export function Seats({ taken, total }: { taken: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((taken / total) * 100)) : 0;
  return (
    <div className="grid min-w-24 gap-1">
      <span className="num text-sm">
        {taken} / {total}
      </span>
      <Progress value={pct} aria-label={`${taken} of ${total} seats taken`} className="h-1.5" />
    </div>
  );
}

function ArchiveButton({ product }: { product: Product }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const archive = useMutation({
    mutationFn: () => api.del<Product>(`/products/${product.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      toast.success(`Archived ${product.name}`);
    },
    onError: (err) => toast.error(`Could not archive: ${errorText(err)}`),
    onSettled: () => setConfirming(false),
  });
  if (product.status === "ARCHIVED") return null;
  if (!confirming)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Archive aria-hidden /> Archive
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={`Confirm archiving ${product.name}`}>
      <Button variant="destructive" size="sm" disabled={archive.isPending} onClick={() => archive.mutate()} autoFocus>
        Confirm archive
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function ProductsView() {
  const { data: me } = useMe();
  const canWrite = can(me, "products:write");
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const [sheet, setSheet] = useState<{ open: boolean; product?: Product }>({ open: false });

  const list = useQuery({
    queryKey: [...qk.products, "list", { status }],
    queryFn: () => api.get<Product[]>("/products", { query: { status } }),
  });

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="min-w-40">
          <Link href={`/products/${p.id}`} className="font-medium text-info-text hover:underline">
            {p.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {p.category} · {p.level} · <span className="num">{p.duration_weeks}</span> weeks
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "price", header: "Price", align: "right", cell: (p) => <Money value={p.price} currency={p.currency} /> },
    { key: "seats", header: "Seats", cell: (p) => <Seats taken={p.stats.seats_taken} total={p.seats_total} /> },
    { key: "sales", header: "Sales", align: "right", cell: (p) => <span className="num">{p.stats.sales}</span> },
    { key: "revenue", header: "Revenue", align: "right", cell: (p) => <Money value={p.stats.revenue} currency={p.currency} /> },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            cell: (p: Product) => (
              <span className="inline-flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setSheet({ open: true, product: p })} aria-label={`Edit ${p.name}`}>
                  <Pencil aria-hidden /> Edit
                </Button>
                <ArchiveButton product={p} />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog, pricing, seats and sales."
        actions={
          canWrite ? (
            <Button onClick={() => setSheet({ open: true })}>
              <Plus aria-hidden /> New product
            </Button>
          ) : null
        }
      />
      <div className="space-y-4">
        <Tabs value={status || "ALL"} onValueChange={(v) => setParams({ status: v === "ALL" ? null : v })}>
          <TabsList aria-label="Filter by status">
            <TabsTrigger value="ALL">All</TabsTrigger>
            {PRODUCT_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(p) => p.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          emptyTitle="No products"
          emptyDescription={status ? "No product has this status." : canWrite ? "Create the first product." : undefined}
        />
      </div>
      {canWrite && <ProductSheet open={sheet.open} product={sheet.product} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />}
    </>
  );
}
