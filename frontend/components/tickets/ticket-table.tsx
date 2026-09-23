"use client";
import Link from "next/link";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { useUpdateTicket, type UpdateTicketInput } from "@/features/tickets/api";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import type { TicketListItem, TicketMeta } from "@/types";
import { PriorityBadge, SlaIndicator, TicketStatusBadge } from "./badges";

export const ALL_TICKET_COLUMNS = [
  "code",
  "subject",
  "customer",
  "status",
  "priority",
  "agent",
  "department",
  "category",
  "sla",
  "tags",
  "created_at",
  "updated_at",
];
export const DEFAULT_TICKET_COLUMNS = ["code", "subject", "customer", "status", "priority", "agent", "sla", "updated_at"];

const quickSelect =
  "h-7 max-w-[10rem] rounded-md border border-transparent bg-transparent px-1.5 text-xs hover:border-input focus:border-primary focus:outline-none";

function QuickSelect({
  value,
  options,
  onChange,
  label,
  disabled,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select aria-label={label} className={quickSelect} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-no-row-click>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface TicketTableProps {
  data?: TicketListItem[];
  loading?: boolean;
  meta?: TicketMeta;
  basePath: string;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  visibleColumns?: string[];
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  quickEdit?: { status: boolean; priority: boolean; assign: boolean };
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
}

export function TicketTable({
  data,
  loading,
  meta,
  basePath,
  sort,
  onSortChange,
  visibleColumns,
  selectable,
  selectedIds,
  onSelectionChange,
  quickEdit,
  footer,
  empty,
  toolbar,
}: TicketTableProps) {
  const update = useUpdateTicket();
  const quick = (id: string, data: UpdateTicketInput, message: string) =>
    update.mutate({ id, data }, { onSuccess: () => toast.success(message), onError: (e) => toast.error(getErrorMessage(e)) });

  const columns: Column<TicketListItem>[] = [
    {
      id: "code",
      header: "شماره",
      sortKey: "number",
      hideable: false,
      className: "whitespace-nowrap",
      cell: (t) => (
        <Link href={`${basePath}/${t.id}`} className="font-mono text-xs font-medium text-muted-foreground hover:text-primary ltr">
          {t.code}
        </Link>
      ),
    },
    {
      id: "subject",
      header: "موضوع",
      sortKey: "subject",
      hideable: false,
      className: "min-w-[14rem] max-w-[22rem]",
      cell: (t) => (
        <div className="min-w-0">
          <Link href={`${basePath}/${t.id}`} className={cn("line-clamp-1 hover:text-primary", t.unread ? "font-bold" : "font-medium")}>
            {t.unread && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-label="خوانده نشده" />}
            {t.subject}
          </Link>
          {t.escalation_level > 0 && <span className="text-[0.7rem] text-danger">ارجاع سطح {t.escalation_level.toLocaleString("fa-IR")}</span>}
        </div>
      ),
    },
    {
      id: "customer",
      header: "مشتری",
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Avatar name={t.customer.full_name} src={t.customer.avatar_url} size="xs" />
          <span className="max-w-[9rem] truncate text-xs">{t.customer.full_name}</span>
        </div>
      ),
    },
    {
      id: "status",
      header: "وضعیت",
      sortKey: "status",
      cell: (t) =>
        quickEdit?.status && meta ? (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.status.color }} aria-hidden />
            <QuickSelect
              label="تغییر وضعیت"
              value={t.status.id}
              options={meta.statuses.filter((s) => s.is_active !== false || s.id === t.status.id).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => quick(t.id, { status_id: v }, "وضعیت تیکت تغییر کرد")}
            />
          </div>
        ) : (
          <TicketStatusBadge status={t.status} />
        ),
    },
    {
      id: "priority",
      header: "اولویت",
      sortKey: "priority",
      cell: (t) =>
        quickEdit?.priority && meta ? (
          <QuickSelect
            label="تغییر اولویت"
            value={t.priority.id}
            options={meta.priorities.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => quick(t.id, { priority_id: v }, "اولویت تیکت تغییر کرد")}
          />
        ) : (
          <PriorityBadge priority={t.priority} />
        ),
    },
    {
      id: "agent",
      header: "کارشناس",
      cell: (t) =>
        quickEdit?.assign && meta?.agents ? (
          <QuickSelect
            label="ارجاع به کارشناس"
            value={t.assigned_agent?.id ?? ""}
            placeholder="— بدون کارشناس —"
            options={meta.agents.map((a) => ({ value: a.id, label: a.full_name }))}
            onChange={(v) => quick(t.id, v ? { assigned_agent_id: v } : { clear_assignee: true }, "تیکت ارجاع شد")}
          />
        ) : t.assigned_agent ? (
          <div className="flex items-center gap-2">
            <Avatar name={t.assigned_agent.full_name} src={t.assigned_agent.avatar_url} size="xs" />
            <span className="max-w-[8rem] truncate text-xs">{t.assigned_agent.full_name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">تعیین نشده</span>
        ),
    },
    { id: "department", header: "دپارتمان", cell: (t) => <span className="text-xs">{t.department?.name ?? "—"}</span> },
    { id: "category", header: "دسته‌بندی", cell: (t) => <span className="text-xs">{t.category?.name ?? "—"}</span> },
    { id: "sla", header: "SLA", sortKey: "resolution_due_at", cell: (t) => <SlaIndicator ticket={t} /> },
    {
      id: "tags",
      header: "برچسب‌ها",
      cell: (t) => (
        <div className="flex max-w-[12rem] flex-wrap gap-1">
          {t.tags.length ? t.tags.map((tag) => <Badge key={tag.id} color={tag.color} size="sm">{tag.name}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: "created_at",
      header: "ایجاد",
      sortKey: "created_at",
      className: "whitespace-nowrap",
      cell: (t) => <span className="text-xs text-muted-foreground" title={formatDateTime(t.created_at)}>{timeAgo(t.created_at)}</span>,
    },
    {
      id: "updated_at",
      header: "آخرین فعالیت",
      sortKey: "updated_at",
      className: "whitespace-nowrap",
      cell: (t) => <span className="text-xs text-muted-foreground" title={formatDateTime(t.updated_at)}>{timeAgo(t.updated_at)}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      getRowId={(t) => t.id}
      sort={sort}
      onSortChange={onSortChange}
      visibleColumns={visibleColumns}
      selectable={selectable}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      rowHref={(t) => `${basePath}/${t.id}`}
      toolbar={toolbar}
      footer={footer}
      empty={empty}
      mobileCard={(t) => (
        <Link href={`${basePath}/${t.id}`} className="block">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("line-clamp-2 text-sm", t.unread ? "font-bold" : "font-medium")}>
              {t.unread && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-primary align-middle" />}
              {t.subject}
            </p>
            <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground ltr">{t.code}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={t.status} size="sm" />
            <PriorityBadge priority={t.priority} size="sm" />
            {t.sla_status !== "none" && <SlaIndicator ticket={t} />}
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.7rem] text-muted-foreground">
            <span className="truncate">{basePath.startsWith("/portal") ? t.department?.name ?? "" : t.customer.full_name}</span>
            <span className="flex items-center gap-1">{timeAgo(t.updated_at)}<Paperclip className="hidden h-3 w-3" /></span>
          </div>
        </Link>
      )}
    />
  );
}
