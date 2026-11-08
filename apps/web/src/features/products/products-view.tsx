"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Package, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, PageTitle, StatusBadge, type Column } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { FilterChip, ListPage, SearchBox, Toolbar, WhoCell, actionBtn, agentTile, errorText, tighten, unpaged, useDebouncedSearch, useUrlParams } from "@/features/payments/shared";
import { PRODUCT_STATUSES, ProductModal } from "./product-form";

/** "7 / 25" mono + 56px mini bar of seats taken. */
export function Seats({ taken, total }: { taken: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((taken / total) * 100)) : 0;
  const tone = pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warning)" : "var(--success)";
  return (
    <span className="inline-flex items-center gap-2">
      <span role="meter" aria-label={`${taken} of ${total} seats taken`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 w-14 overflow-hidden rounded-full bg-panel3">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span className="num text-[12.5px] font-semibold">
        {taken} / {total}
      </span>
    </span>
  );
}

/** Archive = DELETE /products/{id}; two-step inline confirm. Stops row-click propagation. */
export function ArchiveButton({ product, size = "xs", onDone }: { product: Product; size?: "xs" | "sm" | "default"; onDone?: () => void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const archive = useMutation({
    mutationFn: () => api.del<Product>(`/products/${product.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products });
      toast.success(`Archived ${product.name}`);
      onDone?.();
    },
    onError: (err) => toast.error(`Could not archive: ${errorText(err)}`),
    onSettled: () => setConfirming(false),
  });
  if (product.status === "ARCHIVED") return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (!confirming)
    return (
      <Button
        variant={size === "xs" ? "ghost" : "outline"}
        size={size === "xs" ? "icon-xs" : size}
        className={size === "default" ? actionBtn : size === "xs" ? "text-t3 hover:text-danger" : undefined}
        onClick={(e) => {
          stop(e);
          setConfirming(true);
        }}
        aria-label={`Archive ${product.name}`}
        title="Archive program"
      >
        <Archive aria-hidden />
        {size !== "xs" && " Archive"}
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={`Confirm archiving ${product.name}`} onClick={stop}>
      <Button variant="destructive" size={size} className={size === "default" ? actionBtn : undefined} disabled={archive.isPending} onClick={() => archive.mutate()} autoFocus>
        Confirm archive
      </Button>
      <Button variant="ghost" size={size} className={size === "default" ? actionBtn : undefined} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function ProductsView() {
  const router = useRouter();
  const { data: me } = useMe();
  const canWrite = can(me, "products:write");
  const [sp, setParams] = useUrlParams();
  const status = sp.get("status") ?? "";
  const q = sp.get("q") ?? "";
  const [search, setSearch] = useDebouncedSearch(q, (v) => setParams({ q: v }));
  const [modal, setModal] = useState<{ open: boolean; product?: Product }>({ open: false });

  const list = useQuery({ queryKey: [...qk.products, "list", { status }], queryFn: () => api.get<Product[]>("/products", { query: { status } }) });
  // ponytail: GET /products has no `q`; the catalogue is small and unpaginated, so filter client-side.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !list.data) return list.data;
    return list.data.filter((p) => [p.name, p.slug, p.category, p.level].some((s) => s.toLowerCase().includes(needle)));
  }, [list.data, q]);

  const columns: Column<Product>[] = [
    { key: "name", header: "Program", cell: (p) => <WhoCell className="max-w-[260px]" icon={{ icon: Package, ...agentTile("sales") }} title={p.name} sub={p.slug} subMono /> },
    { key: "category", header: "Category", cell: (p) => <span className="text-sm font-medium text-t2">{p.category}</span> },
    { key: "weeks", header: "Length", cell: (p) => <span className="text-sm font-medium"><span className="num">{p.duration_weeks}</span> weeks</span> },
    { key: "level", header: "Level", cell: (p) => <span className="rounded-lg bg-panel3 px-2 py-0.5 text-xs font-bold">{p.level}</span> },
    { key: "seats", header: "Seats", cell: (p) => <Seats taken={p.stats.seats_taken} total={p.seats_total} /> },
    { key: "price", header: "Price", align: "right", cell: (p) => <Money value={p.price} currency={p.currency} className="text-sm font-semibold" /> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} className="h-6 px-[9px]" /> },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            className: "w-0",
            cell: (p: Product) => (
              <span className="inline-flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-t3 hover:text-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ open: true, product: p });
                  }}
                  aria-label={`Edit ${p.name}`}
                  title="Edit program"
                >
                  <Pencil aria-hidden />
                </Button>
                <ArchiveButton product={p} />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <ListPage>
      <PageTitle
        title="Products"
        description="Training programs, pricing and seats. Prices live server-side; agents can read them but never change them."
        actions={
          canWrite ? (
            <Button className={actionBtn} onClick={() => setModal({ open: true })}>
              <Plus aria-hidden /> New program
            </Button>
          ) : undefined
        }
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search programs…" label="Search programs" />
        <FilterChip selected={!status} onClick={() => setParams({ status: null })} count={!status ? list.data?.length : undefined}>
          All
        </FilterChip>
        {PRODUCT_STATUSES.map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => setParams({ status: s })} count={status === s ? list.data?.length : undefined}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </FilterChip>
        ))}
      </Toolbar>
      <DataTable
        columns={tighten(columns)}
        rows={rows}
        rowKey={(p) => p.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        emptyTitle={q ? "No program matches" : "No programs"}
        emptyDescription={q || status ? "Change the filters or run a scenario from Demo control." : canWrite ? "Create the first program." : undefined}
        emptyAction={
          canWrite && !q && !status ? (
            <Button onClick={() => setModal({ open: true })}>
              <Plus aria-hidden /> New program
            </Button>
          ) : undefined
        }
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        minWidth={860}
        {...unpaged(rows)}
      />
      {canWrite && <ProductModal open={modal.open} product={modal.product} onOpenChange={(open) => setModal((s) => ({ ...s, open }))} />}
    </ListPage>
  );
}
