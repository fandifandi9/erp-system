"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/design/cn";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  labels?: {
    showing?: string;
    prev?: string;
    next?: string;
  };
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const showing =
    labels?.showing?.replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total)) ??
    `Menampilkan ${from}–${to} dari ${total}`;

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 text-sm text-erp-text-muted", className)}>
      <p>{showing}</p>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label={labels?.prev ?? "Previous page"}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4rem] text-center font-medium text-erp-text">
          {safePage} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label={labels?.next ?? "Next page"}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
