"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { useAuditLogs } from "@/features/settings/api";
import { useDebounce } from "@/hooks/use-debounce";
import { AUDIT_ACTION_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { ExportMenu } from "./export-menu";
import type { AuditLog } from "@/types";

const tone = (action: string) =>
  action.includes("failed") || action.includes("deleted") || action.includes("reuse") ? "danger" : action.startsWith("auth") ? "info" : action.includes("created") ? "success" : "neutral";

export function AuditLogTable({ platform = false }: { platform?: boolean }) {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const debounced = useDebounce(q, 350);
  const filters = { q: debounced || undefined, action: action || undefined, date_from: from ?? undefined, date_to: to ?? undefined, page, page_size: 25 };
  const { data, isLoading } = useAuditLogs(filters, platform);

  const columns: Column<AuditLog>[] = [
    { id: "date", header: "تاریخ", className: "whitespace-nowrap text-xs", cell: (l) => formatDateTime(l.created_at) },
    { id: "user", header: "کاربر", cell: (l) => l.user ? <span className="flex items-center gap-2 text-xs"><Avatar name={l.user.full_name} size="xs" />{l.user.full_name}</span> : <span className="text-xs text-muted-foreground">سیستم / ناشناس</span> },
    { id: "action", header: "عملیات", cell: (l) => <Badge tone={tone(l.action)}>{AUDIT_ACTION_LABELS[l.action] ?? l.action}</Badge> },
    { id: "entity", header: "موجودیت", cell: (l) => <span className="text-xs text-muted-foreground">{l.entity_type ?? "—"}</span> },
    { id: "ip", header: "IP", cell: (l) => <span className="font-mono text-xs ltr">{l.ip_address ?? "—"}</span> },
    { id: "description", header: "توضیحات", className: "max-w-[24rem]", cell: (l) => <button className="line-clamp-1 text-start text-xs hover:text-primary" onClick={() => setSelected(l)}>{l.description ?? "—"}</button> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.items}
        loading={isLoading}
        getRowId={(l) => l.id}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو در توضیحات، IP یا نام کاربر" icon={<Search className="h-4 w-4" />} className="h-9" /></div>
            <Select size="sm" className="h-9 w-44" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="همه عملیات‌ها" options={[
              { value: "auth", label: "احراز هویت" }, { value: "ticket", label: "تیکت‌ها" }, { value: "message", label: "پیام‌ها" }, { value: "user", label: "کاربران" },
              { value: "customer", label: "مشتریان" }, { value: "role", label: "نقش‌ها و مجوزها" }, { value: "settings", label: "تنظیمات" }, { value: "config", label: "پیکربندی" }, { value: "company", label: "سازمان" }, { value: "data", label: "ورود/خروج اطلاعات" },
            ]} />
            <div className="w-40"><DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} placeholder="از تاریخ" /></div>
            <div className="w-40"><DatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} placeholder="تا تاریخ" /></div>
            {!platform && <ExportMenu url="/audit-logs/export" params={{ ...filters, page: undefined, page_size: undefined }} filename="audit-logs" />}
          </div>
        }
        mobileCard={(l) => (
          <button className="w-full text-start" onClick={() => setSelected(l)}>
            <div className="flex items-center justify-between"><Badge tone={tone(l.action)}>{AUDIT_ACTION_LABELS[l.action] ?? l.action}</Badge><span className="text-[0.7rem] text-muted-foreground">{formatDateTime(l.created_at)}</span></div>
            <p className="mt-1 text-xs">{l.user?.full_name ?? "سیستم"} — {l.description}</p>
          </button>
        )}
        footer={data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPageChange={setPage} />}
      />
      <Modal open={!!selected} onClose={() => setSelected(null)} title="جزئیات رویداد" size="lg">
        {selected && (
          <dl className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
            <dt className="text-muted-foreground">تاریخ</dt><dd>{formatDateTime(selected.created_at)}</dd>
            <dt className="text-muted-foreground">کاربر</dt><dd>{selected.user?.full_name ?? "—"}</dd>
            <dt className="text-muted-foreground">عملیات</dt><dd>{AUDIT_ACTION_LABELS[selected.action] ?? selected.action} <span className="font-mono text-xs text-muted-foreground ltr">({selected.action})</span></dd>
            <dt className="text-muted-foreground">موجودیت</dt><dd className="font-mono text-xs ltr text-start">{selected.entity_type} {selected.entity_id}</dd>
            <dt className="text-muted-foreground">IP</dt><dd className="font-mono ltr text-start">{selected.ip_address}</dd>
            <dt className="text-muted-foreground">مرورگر</dt><dd className="break-all text-xs ltr text-start">{selected.user_agent ?? "—"}</dd>
            <dt className="text-muted-foreground">توضیحات</dt><dd>{selected.description}</dd>
            {selected.changes && <><dt className="text-muted-foreground">تغییرات</dt><dd><pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs ltr text-start">{JSON.stringify(selected.changes, null, 2)}</pre></dd></>}
          </dl>
        )}
      </Modal>
    </>
  );
}
