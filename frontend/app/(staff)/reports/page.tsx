"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageSquareQuote, RefreshCcw, Star } from "lucide-react";
import { useReopenedReport, useSatisfactionReport, useSlaReport, useTicketsReport, type ReportFilters } from "@/features/reports/api";
import { useTicketMeta } from "@/features/tickets/api";
import { usePermission } from "@/hooks/use-permission";
import { formatDate, formatDuration, formatIsoDay, formatNumber, formatPercent } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { PageLoader } from "@/components/ui/spinner";
import { ExportMenu } from "@/components/common/export-menu";
import { DonutChart, HorizontalBars, RatingDistribution, ResponseTimeChart, TrendChart } from "@/components/charts/charts";
import { flattenCategories } from "@/components/tickets/ticket-detail";
import { TicketTable } from "@/components/tickets/ticket-table";
import type { BreakdownRow } from "@/types";

function BreakdownTable({ rows, showRating }: { rows: BreakdownRow[]; showRating?: boolean }) {
  if (!rows.length) return <EmptyState compact title="داده‌ای وجود ندارد" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-start font-medium">عنوان</th>
            <th className="px-3 py-2.5 text-start font-medium">کل</th>
            <th className="px-3 py-2.5 text-start font-medium">باز</th>
            <th className="px-3 py-2.5 text-start font-medium">حل/بسته</th>
            <th className="px-3 py-2.5 text-start font-medium">اولین پاسخ</th>
            <th className="px-3 py-2.5 text-start font-medium">زمان حل</th>
            <th className="px-3 py-2.5 text-start font-medium">رعایت SLA</th>
            {showRating && <th className="px-3 py-2.5 text-start font-medium">امتیاز</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? r.name} className="border-b last:border-0">
              <td className="px-4 py-2.5 font-medium">{r.color && <span className="me-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />}{r.name}</td>
              <td className="px-3 py-2.5">{formatNumber(r.count)}</td>
              <td className="px-3 py-2.5">{formatNumber(r.open)}</td>
              <td className="px-3 py-2.5">{formatNumber(r.resolved)}</td>
              <td className="px-3 py-2.5 text-xs">{formatDuration(r.avg_first_response_minutes)}</td>
              <td className="px-3 py-2.5 text-xs">{formatDuration(r.avg_resolution_minutes)}</td>
              <td className="px-3 py-2.5 text-xs">{r.sla_compliance === null ? "—" : <Badge tone={r.sla_compliance >= 90 ? "success" : r.sla_compliance >= 70 ? "warning" : "danger"}>{formatPercent(r.sla_compliance)}</Badge>}</td>
              {showRating && <td className="px-3 py-2.5 text-xs">{r.rating_avg ? `${formatNumber(r.rating_avg)} ★ (${formatNumber(r.rating_count ?? 0)})` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inner() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const [filters, setFilters] = useState<ReportFilters>({});
  const { data: meta } = useTicketMeta();
  const { can } = usePermission();
  const report = useTicketsReport(filters);
  const sla = useSlaReport(filters);
  const satisfaction = useSatisfactionReport(filters);
  const reopened = useReopenedReport(filters);
  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const exportFor: Record<string, string> = { overview: "by_date", agents: "by_agent", departments: "by_department", categories: "by_category", sla: "sla", satisfaction: "satisfaction", reopened: "reopened" };
  const s = report.data?.summary;

  return (
    <div>
      <PageHeader
        title="گزارش‌ها"
        description="تحلیل عملکرد پشتیبانی، SLA و رضایت مشتریان"
        actions={can("reports.export") && (
          <>
            <ExportMenu url="/reports/export" params={{ ...filters, report: exportFor[tab] ?? "by_date" }} filename={`report-${tab}`} label="خروجی این گزارش" />
            <ExportMenu url="/reports/export" params={{ ...filters, report: "closed" }} filename="closed-tickets" label="تیکت‌های بسته شده" />
          </>
        )}
      />

      <Card className="mb-5">
        <CardBody className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <DatePicker value={filters.date_from ?? null} onChange={(v) => set({ date_from: v ?? undefined })} placeholder="از تاریخ" max={filters.date_to} />
          <DatePicker value={filters.date_to ?? null} onChange={(v) => set({ date_to: v ?? undefined })} placeholder="تا تاریخ" min={filters.date_from} />
          <Select value={filters.department_id ?? ""} onChange={(e) => set({ department_id: e.target.value || undefined })} placeholder="همه دپارتمان‌ها" options={(meta?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <Select value={filters.agent_id ?? ""} onChange={(e) => set({ agent_id: e.target.value || undefined })} placeholder="همه کارشناسان" options={(meta?.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))} />
          <Select value={filters.category_id ?? ""} onChange={(e) => set({ category_id: e.target.value || undefined })} placeholder="همه دسته‌بندی‌ها" options={flattenCategories(meta?.categories ?? [])} />
          <Select value={filters.status_id ?? ""} onChange={(e) => set({ status_id: e.target.value || undefined })} placeholder="همه وضعیت‌ها" options={(meta?.statuses ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <Select value={filters.priority_id ?? ""} onChange={(e) => set({ priority_id: e.target.value || undefined })} placeholder="همه اولویت‌ها" options={(meta?.priorities ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </CardBody>
      </Card>

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <StatCard label="کل تیکت‌ها" value={s.total} />
          <StatCard label="باز" value={s.open} tone="info" />
          <StatCard label="حل شده" value={s.resolved} tone="success" />
          <StatCard label="بسته شده" value={s.closed} />
          <StatCard label="اولین پاسخ" value={formatDuration(s.avg_first_response_minutes)} />
          <StatCard label="زمان حل" value={formatDuration(s.avg_resolution_minutes)} />
          <StatCard label="رعایت SLA" value={formatPercent(s.sla_compliance)} tone="success" />
          <StatCard label="بازگشایی شده" value={s.reopened} tone="warning" />
        </div>
      )}

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: "overview", label: "نمای کلی" },
          { value: "agents", label: "کارشناسان" },
          { value: "departments", label: "دپارتمان‌ها" },
          { value: "categories", label: "دسته‌بندی و اولویت" },
          { value: "sla", label: "عملکرد SLA" },
          { value: "satisfaction", label: "رضایت مشتریان" },
          { value: "reopened", label: "بازگشایی شده" },
        ]}
      />

      {report.isLoading && <PageLoader />}
      {report.data && tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2"><CardHeader title="تیکت‌ها بر اساس تاریخ" /><CardBody><TrendChart data={report.data.by_date} height={300} /></CardBody></Card>
          <Card><CardHeader title="بر اساس وضعیت" /><CardBody><DonutChart data={report.data.by_status} /></CardBody></Card>
          <Card className="xl:col-span-2"><CardHeader title="میانگین زمان پاسخگویی و حل" description="۳۰ روز اخیر (ساعت)" /><CardBody><ResponseTimeChart data={report.data.response_trend} /></CardBody></Card>
          <Card><CardHeader title="بر اساس اولویت" /><CardBody><DonutChart data={report.data.by_priority} /></CardBody></Card>
          <Card className="xl:col-span-3">
            <CardHeader title="جزئیات روزانه" />
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card"><tr className="border-b text-xs text-muted-foreground"><th className="px-4 py-2 text-start font-medium">تاریخ</th><th className="px-4 py-2 text-start font-medium">ایجاد شده</th><th className="px-4 py-2 text-start font-medium">حل شده</th></tr></thead>
                <tbody>{[...report.data.by_date].reverse().map((d) => <tr key={d.date} className="border-b last:border-0"><td className="px-4 py-2">{formatIsoDay(d.date)}</td><td className="px-4 py-2">{formatNumber(d.created)}</td><td className="px-4 py-2">{formatNumber(d.resolved)}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {report.data && tab === "agents" && (
        <div className="space-y-6">
          <Card><CardHeader title="تعداد تیکت هر کارشناس" /><CardBody><HorizontalBars data={report.data.by_agent as unknown as Record<string, unknown>[]} /></CardBody></Card>
          <Card><CardHeader title="عملکرد کارشناسان" /><BreakdownTable rows={report.data.by_agent} showRating /></Card>
        </div>
      )}
      {report.data && tab === "departments" && (
        <div className="space-y-6">
          <Card><CardHeader title="تیکت‌ها بر اساس دپارتمان" /><CardBody><HorizontalBars data={report.data.by_department as unknown as Record<string, unknown>[]} /></CardBody></Card>
          <Card><BreakdownTable rows={report.data.by_department} /></Card>
        </div>
      )}
      {report.data && tab === "categories" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader title="بر اساس دسته‌بندی" /><CardBody><HorizontalBars data={report.data.by_category as unknown as Record<string, unknown>[]} /></CardBody></Card>
          <Card><CardHeader title="بر اساس اولویت" /><CardBody><HorizontalBars data={report.data.by_priority as unknown as Record<string, unknown>[]} /></CardBody></Card>
          <Card className="xl:col-span-2"><CardHeader title="جزئیات دسته‌بندی‌ها" /><BreakdownTable rows={report.data.by_category} /></Card>
        </div>
      )}
      {tab === "sla" && sla.data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="درصد رعایت SLA" value={formatPercent(sla.data.compliance)} tone="success" />
            <StatCard label="رعایت شده" value={sla.data.met} tone="success" />
            <StatCard label="نقض شده" value={sla.data.breached} tone="danger" />
            <StatCard label="در آستانه نقض" value={sla.data.warning} tone="warning" />
          </div>
          <Card><CardHeader title="SLA بر اساس اولویت" /><BreakdownTable rows={sla.data.by_priority} /></Card>
          <Card><CardHeader title="SLA بر اساس دپارتمان" /><BreakdownTable rows={sla.data.by_department} /></Card>
        </div>
      )}
      {tab === "satisfaction" && satisfaction.data && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader title="میانگین رضایت" />
            <CardBody className="text-center">
              <p className="text-4xl font-bold">{satisfaction.data.average ? formatNumber(satisfaction.data.average) : "—"}</p>
              <div className="my-2 flex justify-center gap-1">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-5 w-5 ${i <= Math.round(satisfaction.data!.average ?? 0) ? "fill-warning text-warning" : "text-muted-foreground/30"}`} />)}</div>
              <p className="text-xs text-muted-foreground">{formatNumber(satisfaction.data.count)} نظر ثبت شده</p>
              <div className="mt-6 text-start"><RatingDistribution data={satisfaction.data.distribution} /></div>
            </CardBody>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="امتیاز کارشناسان" />
            <CardBody><HorizontalBars data={satisfaction.data.by_agent} valueKey="average" valueLabel="میانگین امتیاز" format={(v) => formatNumber(v)} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="امتیاز دپارتمان‌ها" />
            <ul className="divide-y">{satisfaction.data.by_department.map((d) => <li key={d.id} className="flex justify-between px-5 py-2.5 text-sm"><span>{d.name}</span><span>{formatNumber(d.average)} ★ <span className="text-xs text-muted-foreground">({formatNumber(d.count)})</span></span></li>)}</ul>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="بازخورد مشتریان" icon={<MessageSquareQuote className="h-4 w-4" />} />
            {satisfaction.data.feedback.length === 0 ? <EmptyState compact title="بازخوردی ثبت نشده است" /> : (
              <ul className="max-h-96 divide-y overflow-y-auto">
                {satisfaction.data.feedback.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{f.customer} {f.agent && <span className="text-muted-foreground">← {f.agent}</span>}</span>
                      <span className="text-warning">{"★".repeat(f.rating)}<span className="text-muted-foreground/30">{"★".repeat(5 - f.rating)}</span></span>
                    </div>
                    <p className="mt-1 text-sm leading-7">{f.feedback}</p>
                    <p className="flex items-center justify-between text-[0.7rem] text-muted-foreground">{formatDate(f.created_at)} <Link href={`/tickets/${f.ticket_id}`} className="text-primary">مشاهده تیکت</Link></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="روند رضایت" />
            <CardBody><HorizontalBars data={satisfaction.data.trend.slice(-14).map((t) => ({ name: formatIsoDay(t.date), count: t.average }))} valueLabel="میانگین امتیاز" format={(v) => formatNumber(v)} /></CardBody>
          </Card>
        </div>
      )}
      {tab === "reopened" && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><RefreshCcw className="h-4 w-4" /> تیکت‌هایی که پس از حل یا بسته شدن، مجدداً باز شده‌اند.</p>
          <TicketTable data={reopened.data} loading={reopened.isLoading} basePath="/tickets" visibleColumns={["code", "subject", "customer", "status", "agent", "updated_at"]} />
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense><Inner /></Suspense>;
}
