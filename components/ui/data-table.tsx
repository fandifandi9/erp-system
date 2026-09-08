"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/design/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  align?: "left" | "center" | "right";
};

export type DataTableSort = {
  columnId: string;
  direction: "asc" | "desc";
};

export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  getRowId = (row, index) => String(row.id ?? index),
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyAction,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  rowActions,
  className,
  stickyHeader = true,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId?: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  rowActions?: (row: T) => React.ReactNode;
  className?: string;
  stickyHeader?: boolean;
}) {
  const selectable = Boolean(onSelectionChange && selectedIds);
  const allIds = rows.map((r, i) => getRowId(r, i));
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selectedIds!.has(id));

  const toggleAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(allIds));
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    if (sort?.columnId !== col.id) {
      onSortChange({ columnId: col.id, direction: "asc" });
      return;
    }
    if (sort.direction === "asc") onSortChange({ columnId: col.id, direction: "desc" });
    else onSortChange(null);
  };

  if (error) {
    return <ErrorState title={error} />;
  }

  if (loading) {
    return <TableSkeleton rows={6} cols={columns.length} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "Belum ada data"}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const alignClass = (align?: "left" | "center" | "right") =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-erp-border bg-erp-surface", className)}>
      <table className="min-w-full text-sm">
        <thead className={cn("bg-erp-surface-muted text-erp-text-muted", stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {selectable ? (
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide",
                  alignClass(col.align),
                  col.headerClassName,
                )}
              >
                {col.sortable && onSortChange ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-erp-text"
                    onClick={() => handleSort(col)}
                  >
                    {col.header}
                    {sort?.columnId === col.id ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
            {rowActions ? <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase">Aksi</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-erp-border">
          {rows.map((row, index) => {
            const rowId = getRowId(row, index);
            return (
              <tr key={rowId} className="hover:bg-erp-surface-muted/60">
                {selectable ? (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds!.has(rowId)}
                      onChange={() => toggleRow(rowId)}
                      aria-label={`Select row ${rowId}`}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn("px-3 py-2.5 text-erp-text", alignClass(col.align), col.className)}
                  >
                    {col.accessor ? col.accessor(row) : null}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-3 py-2.5 text-right">{rowActions(row)}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
