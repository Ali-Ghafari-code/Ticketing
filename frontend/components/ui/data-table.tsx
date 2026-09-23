"use client";
import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";
import { Checkbox } from "./checkbox";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** can the user hide this column? */
  hideable?: boolean;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  visibleColumns?: string[];
  onVisibleColumnsChange?: (ids: string[]) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  rowHref?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  mobileCard?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function ColumnPicker<T>({
  columns,
  visible,
  onChange,
}: {
  columns: Column<T>[];
  visible: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted"
        >
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">ستون‌ها</span>
        </button>
      )}
      panelClassName="w-56 p-2"
    >
      <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">نمایش ستون‌ها</p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {columns
          .filter((c) => c.hideable !== false)
          .map((c) => (
            <div key={c.id} className="rounded-md px-2 py-1 hover:bg-muted">
              <Checkbox
                label={c.header}
                checked={visible.includes(c.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...visible, c.id] : visible.filter((id) => id !== c.id))
                }
              />
            </div>
          ))}
      </div>
    </Popover>
  );
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  empty,
  sort,
  onSortChange,
  visibleColumns,
  selectable,
  selectedIds = [],
  onSelectionChange,
  rowHref,
  rowClassName,
  mobileCard,
  toolbar,
  footer,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const shown = visibleColumns
    ? columns.filter((c) => c.hideable === false || visibleColumns.includes(c.id))
    : columns;
  const rows = data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(getRowId(r)));

  const toggleAll = () =>
    onSelectionChange?.(allSelected ? selectedIds.filter((id) => !rows.some((r) => getRowId(r) === id)) : Array.from(new Set([...selectedIds, ...rows.map(getRowId)])));
  const toggleOne = (id: string) =>
    onSelectionChange?.(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const headerCell = (c: Column<T>) => {
    if (!c.sortKey || !onSortChange) return c.header;
    const active = sort?.key === c.sortKey;
    const Icon = !active ? ArrowUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
        onClick={() =>
          onSortChange({ key: c.sortKey!, direction: active && sort?.direction === "desc" ? "asc" : "desc" })
        }
      >
        {c.header}
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      {toolbar && <div className="border-b p-3">{toolbar}</div>}

      {/* Desktop / tablet table */}
      <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="انتخاب همه"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[rgb(var(--primary))]"
                  />
                </th>
              )}
              {shown.map((c) => (
                <th key={c.id} className={cn("whitespace-nowrap px-3 py-2.5 text-start font-medium", c.headerClassName)}>
                  {headerCell(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {selectable && <td className="px-3 py-3" />}
                  {shown.map((c) => (
                    <td key={c.id} className="px-3 py-3">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows.map((row) => {
                const id = getRowId(row);
                const href = rowHref?.(row);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "border-b transition-colors last:border-0 hover:bg-muted/40",
                      href && "cursor-pointer",
                      selectedIds.includes(id) && "bg-primary/5",
                      rowClassName?.(row),
                    )}
                    onClick={(e) => {
                      if (!href) return;
                      const target = e.target as HTMLElement;
                      if (target.closest("button,a,input,select,label,[data-no-row-click]")) return;
                      if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
                      else router.push(href);
                    }}
                  >
                    {selectable && (
                      <td className="px-3 py-2.5" data-no-row-click>
                        <input
                          type="checkbox"
                          aria-label="انتخاب"
                          checked={selectedIds.includes(id)}
                          onChange={() => toggleOne(id)}
                          className="h-4 w-4 accent-[rgb(var(--primary))]"
                        />
                      </td>
                    )}
                    {shown.map((c) => (
                      <td key={c.id} className={cn("px-3 py-2.5 align-middle", c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      {mobileCard && (
        <div className="divide-y md:hidden">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          {!loading &&
            rows.map((row) => {
              const id = getRowId(row);
              return (
                <div key={id} className={cn("flex gap-3 p-4", selectedIds.includes(id) && "bg-primary/5")}>
                  {selectable && (
                    <input
                      type="checkbox"
                      aria-label="انتخاب"
                      checked={selectedIds.includes(id)}
                      onChange={() => toggleOne(id)}
                      className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]"
                    />
                  )}
                  <div className="min-w-0 flex-1">{mobileCard(row)}</div>
                </div>
              );
            })}
        </div>
      )}

      {!loading && rows.length === 0 && (empty ?? <EmptyState title="موردی یافت نشد" description="فیلترها را تغییر دهید یا مورد جدیدی ایجاد کنید." />)}
      {footer && <div className="border-t px-3 py-3">{footer}</div>}
    </div>
  );
}
