"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { useBulkUpdate, useTicketMeta, useTickets, type TicketFilters } from "@/features/tickets/api";
import { usePermission } from "@/hooks/use-permission";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { SLA_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnPicker, type Column } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/common/export-menu";
import { ALL_TICKET_COLUMNS, DEFAULT_TICKET_COLUMNS, TicketTable } from "@/components/tickets/ticket-table";
import { flattenCategories } from "@/components/tickets/ticket-detail";
import type { TicketListItem } from "@/types";

const DEFAULTS = {
  q: "",
  view: "active",
  status_id: [] as string[],
  priority_id: [] as string[],
  category_id: "",
  department_id: "",
  agent: "",
  customer_id: "",
  tag_id: [] as string[],
  sla_status: [] as string[],
  date_from: "",
  date_to: "",
  overdue: false,
  escalated: false,
  sort: "updated_at",
  direction: "desc",
  page: 1,
  page_size: 20,
};

const COLUMN_LABELS: Record<string, string> = {
  code: "شماره", subject: "موضوع", customer: "مشتری", status: "وضعیت", priority: "اولویت", agent: "کارشناس",
  department: "دپارتمان", category: "دسته‌بندی", sla: "SLA", tags: "برچسب‌ها", created_at: "ایجاد", updated_at: "آخرین فعالیت",
};

function MultiChips({ options, value, onChange }: { options: { value: string; label: string; color?: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`rounded-md border px-2 py-1 text-xs transition ${on ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-muted"}`}
          >
            {o.color && <span className="me-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TicketsPageInner() {
  const [state, setState] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounce(search, 400);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { can } = usePermission();
  const user = useAuthStore((s) => s.user);
  const { data: meta } = useTicketMeta();
  const bulk = useBulkUpdate();

  const [columns, setColumns] = useState<string[]>(() => user?.preferences?.ticket_columns ?? DEFAULT_TICKET_COLUMNS);
  const saveColumns = (ids: string[]) => {
    setColumns(ids);
    api.put("/users/me/preferences", { ticket_columns: ids }).catch(() => undefined);
  };

  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const viewFilters: Record<string, Partial<TicketFilters>> = {
    active: { state: "active" },
    mine: { state: "active", agent: "me" },
    unassigned: { state: "active", agent: "unassigned" },
    overdue: { overdue: true },
    escalated: { state: "active", escalated: true },
    resolved: { state: "resolved" },
    closed: { state: "closed" },
    all: {},
  };

  const filters: TicketFilters = useMemo(() => {
    const f: TicketFilters = {
      ...viewFilters[state.view],
      q: state.q || undefined,
      status_id: state.status_id,
      priority_id: state.priority_id,
      category_id: state.category_id || undefined,
      department_id: state.department_id || undefined,
      customer_id: state.customer_id || undefined,
      tag_id: state.tag_id,
      sla_status: state.sla_status,
      date_from: state.date_from || undefined,
      date_to: state.date_to || undefined,
      sort: state.sort,
      direction: state.direction as "asc" | "desc",
      page: state.page,
      page_size: state.page_size,
    };
    if (state.agent) f.agent = state.agent;
    if (state.overdue) f.overdue = true;
    if (state.escalated) f.escalated = true;
    if (state.status_id.length) delete f.state;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const { data, isLoading, isFetching } = useTickets(filters);
  const activeFilterCount =
    state.status_id.length + state.priority_id.length + state.tag_id.length + state.sla_status.length +
    [state.category_id, state.department_id, state.agent, state.customer_id, state.date_from, state.date_to].filter(Boolean).length;

  const runBulk = (payload: Parameters<typeof bulk.mutate>[0]) =>
    bulk.mutate(payload, {
      onSuccess: (r) => {
        toast.success(r.message);
        setSelected([]);
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  const exportParams = { ...filters, page: undefined, page_size: undefined };
  const pickerColumns: Column<TicketListItem>[] = ALL_TICKET_COLUMNS.map((id) => ({ id, header: COLUMN_LABELS[id], cell: () => null, hideable: !["code", "subject"].includes(id) }));

  return (
    <div>
      <PageHeader
        title="تیکت‌ها"
        description={data ? `${formatNumber(data.total)} تیکت` : undefined}
        actions={
          <>
            {can("tickets.export") && <ExportMenu url="/tickets/export" params={exportParams} filename="tickets" />}
            {can("tickets.create") && (
              <Link href="/tickets/new"><Button><Plus className="h-4 w-4" /> تیکت جدید</Button></Link>
            )}
          </>
        }
      />

      <Tabs
        className="mb-4"
        value={state.view}
        onChange={(view) => setState({ view })}
        items={[
          { value: "active", label: "فعال" },
          { value: "mine", label: "تیکت‌های من" },
          { value: "unassigned", label: "بدون کارشناس" },
          { value: "overdue", label: "معوق" },
          { value: "escalated", label: "ارجاع شده" },
          { value: "resolved", label: "حل شده" },
          { value: "closed", label: "بسته شده" },
          { value: "all", label: "همه" },
        ]}
      />

      <TicketTable
        data={data?.items}
        loading={isLoading}
        meta={meta}
        basePath="/tickets"
        sort={{ key: state.sort, direction: state.direction as "asc" | "desc" }}
        onSortChange={(s) => setState({ sort: s.key, direction: s.direction })}
        visibleColumns={columns}
        selectable={can("tickets.update") || can("tickets.assign")}
        selectedIds={selected}
        onSelectionChange={setSelected}
        quickEdit={{ status: can("tickets.update"), priority: can("tickets.update"), assign: can("tickets.assign") }}
        empty={<EmptyState title="تیکتی یافت نشد" description="فیلترها یا عبارت جستجو را تغییر دهید." />}
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[12rem] flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجو: شماره تیکت، موضوع، نام یا موبایل مشتری"
                  icon={<Search className="h-4 w-4" />}
                  className="h-9"
                  endSlot={isFetching ? <span className="me-2 h-2 w-2 animate-pulse rounded-full bg-primary" /> : undefined}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setFiltersOpen(true)}>
                <Filter className="h-4 w-4" /> فیلترها
                {activeFilterCount > 0 && <Badge tone="primary" size="sm">{formatNumber(activeFilterCount)}</Badge>}
              </Button>
              <ColumnPicker columns={pickerColumns} visible={columns} onChange={saveColumns} />
            </div>
            {selected.length > 0 && meta && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 p-2 text-sm">
                <span className="px-1 font-medium">{formatNumber(selected.length)} مورد انتخاب شده</span>
                {can("tickets.update") && (
                  <Select size="sm" className="w-40" value="" placeholder="تغییر وضعیت..." options={meta.statuses.map((s) => ({ value: s.id, label: s.name }))} onChange={(e) => e.target.value && runBulk({ ticket_ids: selected, status_id: e.target.value })} />
                )}
                {can("tickets.update") && (
                  <Select size="sm" className="w-36" value="" placeholder="تغییر اولویت..." options={meta.priorities.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => e.target.value && runBulk({ ticket_ids: selected, priority_id: e.target.value })} />
                )}
                {can("tickets.assign") && (
                  <Select size="sm" className="w-44" value="" placeholder="ارجاع به..." options={(meta.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))} onChange={(e) => e.target.value && runBulk({ ticket_ids: selected, assigned_agent_id: e.target.value })} />
                )}
                {can("tickets.update") && meta.tags && (
                  <Select size="sm" className="w-36" value="" placeholder="افزودن برچسب..." options={meta.tags.map((t) => ({ value: t.id, label: t.name }))} onChange={(e) => e.target.value && runBulk({ ticket_ids: selected, add_tag_ids: [e.target.value] })} />
                )}
                <Button size="xs" variant="ghost" onClick={() => setSelected([])}><X className="h-3.5 w-3.5" /> لغو انتخاب</Button>
              </div>
            )}
          </div>
        }
        footer={
          data && (
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              pageSize={data.page_size}
              onPageChange={(page) => setState({ page }, { resetPage: false })}
              onPageSizeChange={(page_size) => setState({ page_size })}
            />
          )
        }
      />

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={<span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> فیلتر تیکت‌ها</span>}
        footer={
          <>
            <Button variant="ghost" onClick={() => setState({ status_id: [], priority_id: [], category_id: "", department_id: "", agent: "", customer_id: "", tag_id: [], sla_status: [], date_from: "", date_to: "" })}>
              پاک کردن فیلترها
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>نمایش نتایج</Button>
          </>
        }
      >
        {meta && (
          <div className="space-y-5 p-5">
            <FormField label="وضعیت">
              <MultiChips options={meta.statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))} value={state.status_id} onChange={(status_id) => setState({ status_id })} />
            </FormField>
            <FormField label="اولویت">
              <MultiChips options={meta.priorities.map((p) => ({ value: p.id, label: p.name, color: p.color }))} value={state.priority_id} onChange={(priority_id) => setState({ priority_id })} />
            </FormField>
            <FormField label="وضعیت SLA">
              <MultiChips options={["healthy", "warning", "breached", "paused", "met", "none"].map((s) => ({ value: s, label: SLA_LABELS[s] }))} value={state.sla_status} onChange={(sla_status) => setState({ sla_status })} />
            </FormField>
            <FormField label="کارشناس">
              <Select value={state.agent} onChange={(e) => setState({ agent: e.target.value })} placeholder="همه" options={[{ value: "me", label: "تیکت‌های من" }, { value: "unassigned", label: "بدون کارشناس" }, ...(meta.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))]} />
            </FormField>
            <FormField label="دپارتمان">
              <Select value={state.department_id} onChange={(e) => setState({ department_id: e.target.value })} placeholder="همه" options={meta.departments.map((d) => ({ value: d.id, label: d.name }))} />
            </FormField>
            <FormField label="دسته‌بندی" hint="زیرمجموعه‌ها نیز شامل می‌شوند">
              <Select value={state.category_id} onChange={(e) => setState({ category_id: e.target.value })} placeholder="همه" options={flattenCategories(meta.categories)} />
            </FormField>
            {meta.tags && meta.tags.length > 0 && (
              <FormField label="برچسب‌ها">
                <MultiChips options={meta.tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))} value={state.tag_id} onChange={(tag_id) => setState({ tag_id })} />
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="از تاریخ">
                <DatePicker value={state.date_from || null} onChange={(v) => setState({ date_from: v ?? "" })} max={state.date_to || undefined} />
              </FormField>
              <FormField label="تا تاریخ">
                <DatePicker value={state.date_to || null} onChange={(v) => setState({ date_to: v ?? "" })} min={state.date_from || undefined} />
              </FormField>
            </div>
            {state.customer_id && (
              <div className="flex items-center justify-between rounded-lg bg-muted p-2 text-xs">
                فیلتر بر اساس یک مشتری خاص فعال است
                <button className="text-primary" onClick={() => setState({ customer_id: "" })}>حذف</button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketsPageInner />
    </Suspense>
  );
}
