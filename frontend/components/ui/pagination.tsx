"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

function range(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Pagination({ page, pages, total, pageSize, onPageChange, onPageSizeChange, className }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          نمایش {formatNumber(from)} تا {formatNumber(to)} از {formatNumber(total)}
        </span>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-md border bg-card px-1.5 text-xs"
            aria-label="تعداد در صفحه"
          >
            {[10, 20, 50, 100].map((s) => (
              <option key={s} value={s}>
                {formatNumber(s)} در صفحه
              </option>
            ))}
          </select>
        )}
      </div>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="صفحه‌بندی">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-card disabled:opacity-40"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="صفحه قبل"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {range(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "hidden h-8 min-w-8 rounded-md px-2 text-xs sm:inline-block",
                  p === page ? "bg-primary text-primary-foreground" : "border bg-card hover:bg-muted",
                )}
              >
                {formatNumber(p)}
              </button>
            ),
          )}
          <span className="px-2 text-xs text-muted-foreground sm:hidden">
            {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border bg-card disabled:opacity-40"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="صفحه بعد"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
