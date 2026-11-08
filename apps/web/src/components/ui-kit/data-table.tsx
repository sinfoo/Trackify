"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState } from "./states";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Server pagination. Omit for unpaginated tables. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  skeletonRows?: number;
  /** Horizontal scroll floor. Defaults to 680px for <=5 columns, 900px otherwise (README). */
  minWidth?: number | string;
  /** Render without the card chrome (when the parent is already a card). */
  bare?: boolean;
  className?: string;
}

/**
 * Prototype list table: card radius 22, header 12px 20px eyebrow, rows 13px 20px hover --panel2,
 * footer "Showing n of m" + pager, shimmer skeleton rows, centred empty state.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
  page,
  pageSize,
  total,
  onPageChange,
  skeletonRows = 6,
  minWidth,
  bare,
  className,
}: DataTableProps<T>) {
  if (error && !loading) return <ErrorState error={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  const paged = page !== undefined && pageSize !== undefined && total !== undefined;
  const pages = paged ? Math.max(1, Math.ceil(total / pageSize)) : 0;
  const shown = rows?.length ?? 0;
  const from = paged && shown ? (page - 1) * pageSize + 1 : 0;
  const to = paged ? from + shown - 1 : shown;

  return (
    <div className={cn(!bare && "overflow-hidden rounded-[22px] border border-hair bg-panel shadow-card", className)}>
      <Table minWidth={minWidth ?? (columns.length <= 5 ? 680 : 900)}>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody aria-busy={loading || undefined}>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-3.5 w-full max-w-40" style={{ maxWidth: `${55 + ((i * 17 + c.key.length * 7) % 40)}%` }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows?.map((row, i) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn("anim-row-in", onRowClick && "cursor-pointer")}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {paged && (
        // Prototype list footer: 12px 20px, 12.5 --t3, "Previous" / "Next" 30px hairline buttons.
        <div className="flex items-center justify-between gap-2 border-t border-hair px-5 py-3 text-[12.5px] text-t3">
          <span className="tabular">
            {loading ? "Loading…" : shown ? `Showing ${from}–${to} of ${total}` : `Showing 0 of ${total}`}
          </span>
          {onPageChange && (
            <div className="flex items-center gap-1.5">
              <span className="num mr-1 text-xs whitespace-nowrap">
                {page} / {pages}
              </span>
              <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5 text-[12.5px] font-bold text-t2" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
                <ChevronLeft aria-hidden className="size-3.5" /> Previous
              </Button>
              <Button variant="outline" size="sm" className="h-[30px] rounded-lg px-2.5 text-[12.5px] font-bold text-t2" aria-label="Next page" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>
                Next <ChevronRight aria-hidden className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
