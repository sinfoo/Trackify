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
  onRowClick?: (row: T) => void;
  /** Server pagination. Omit for unpaginated tables. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  skeletonRows?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  onRowClick,
  page,
  pageSize,
  total,
  onPageChange,
  skeletonRows = 6,
  className,
}: DataTableProps<T>) {
  if (error && !loading) return <ErrorState error={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const pages = page && pageSize && total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 0;

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <Table>
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
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows?.map((row) => (
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
                  className={cn(onRowClick && "cursor-pointer")}
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
      {pages > 0 && onPageChange && (
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-sm text-muted-foreground">
          <span className="num">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={loading || page! <= 1}
              onClick={() => onPageChange(page! - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={loading || page! >= pages}
              onClick={() => onPageChange(page! + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
