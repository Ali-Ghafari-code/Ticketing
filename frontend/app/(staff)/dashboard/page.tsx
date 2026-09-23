"use client";
import Link from "next/link";
import {
  AlarmClock,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  MessageCircleReply,
  Plus,
  Smile,
  Sparkles,
  Timer,
  UserCheck,
  UserX,
  CalendarDays,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import { useDashboard, type AgentDashboard, type AdminDashboard } from "@/features/reports/api";
import { useAuthStore } from "@/store/auth";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { DonutChart, HorizontalBars, RatingDistribution, ResponseTimeChart, TrendChart } from "@/components/charts/charts";
import { useState } from "react";

function AgentView({ data }: { data: AgentDashboard }) {
  const c = data.counts;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="تیکت‌های من" value={c.assigned} icon={<UserCheck className="h-4 w-4" />} tone="primary" href="/tickets?agent=me&state=active" />
        <StatCard label="بدون کارشناس" value={c.unassigned} icon={<UserX className="h-4 w-4" />} tone="warning" href="/tickets?agent=unassigned&state=active" />
        <StatCard label="تیکت‌های جدید" value={c.new} icon={<Sparkles className="h-4 w-4" />} tone="info" href="/tickets?state=open" />
        <StatCard label="در انتظار" value={c.pending} icon={<Hourglass className="h-4 w-4" />} href="/tickets?state=pending" />
        <StatCard label="معوق" value={c.overdue} icon={<AlarmClock className="h-4 w-4" />} tone="danger" href="/tickets?overdue=true" />
        <StatCard label="نقض SLA" value={c.sla_breaches} icon={<AlertOctagon className="h-4 w-4" />} tone="danger" href="/tickets?sla_status=breached&state=active" hint={c.sla_warnings ? `${formatNumber(c.sla_warnings)} تیکت در آستانه نقض` : undefined} />
        <StatCard label="در انتظار پاسخ مشتری" value={c.waiting_customer} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="در انتظار پاسخ پشتیبانی" value={c.waiting_support} icon={<MessageCircleReply className="h-4 w-4" />} tone="primary" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="روند تیکت‌ها" description="۱۴ روز اخیر" />
          <CardBody><TrendChart data={data.over_time} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="تیکت‌ها بر اساس وضعیت" />
          <CardBody><DonutChart data={data.by_status} /></CardBody>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="بر اساس اولویت" />
          <CardBody><HorizontalBars data={data.by_priority as unknown as Record<string, unknown>[]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="بر اساس دسته‌بندی" />
          <CardBody><HorizontalBars data={data.by_category as unknown as Record<string, unknown>[]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="زمان پاسخگویی" description={`میانگین اولین پاسخ: ${formatDuration(data.avg_first_response_minutes)} · زمان حل: ${formatDuration(data.avg_resolution_minutes)}`} />
          <CardBody><ResponseTimeChart data={data.response_trend} height={200} /></CardBody>
        </Card>
      </div>
    </div>
  );
}

function AdminView({ data }: { data: AdminDashboard }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="کل تیکت‌ها" value={s.total} icon={<Inbox className="h-4 w-4" />} tone="primary" href="/tickets" />
        <StatCard label="تیکت‌های باز" value={s.open} icon={<Clock className="h-4 w-4" />} tone="info" href="/tickets?state=active" />
        <StatCard label="بسته شده" value={s.closed} icon={<TicketCheck className="h-4 w-4" />} tone="success" href="/tickets?state=closed" />
        <StatCard label="جدید امروز" value={s.new_today} icon={<Sparkles className="h-4 w-4" />} hint={`این هفته: ${formatNumber(s.this_week)} · این ماه: ${formatNumber(s.this_month)}`} />
        <StatCard label="معوق" value={s.overdue} icon={<AlarmClock className="h-4 w-4" />} tone="danger" href="/tickets?overdue=true" />
        <StatCard label="میانگین اولین پاسخ" value={formatDuration(s.avg_first_response_minutes)} icon={<Timer className="h-4 w-4" />} />
        <StatCard label="میانگین زمان حل" value={formatDuration(s.avg_resolution_minutes)} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="رعایت SLA" value={formatPercent(s.sla_compliance)} icon={<ShieldCheck className="h-4 w-4" />} tone={s.sla_compliance !== null && s.sla_compliance < 80 ? "warning" : "success"} hint={`${formatNumber(s.sla_breached)} مورد نقض`} />
        <StatCard label="رضایت مشتری" value={s.satisfaction_avg ? `${formatNumber(s.satisfaction_avg)} از ۵` : "—"} icon={<Smile className="h-4 w-4" />} tone="warning" hint={`${formatNumber(s.satisfaction_count)} نظر`} />
        <StatCard label="بدون کارشناس" value={s.unassigned} icon={<UserX className="h-4 w-4" />} href="/tickets?agent=unassigned&state=active" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="روند تیکت‌ها" description="۳۰ روز اخیر" actions={<Link href="/reports" className="text-xs text-primary">گزارش کامل</Link>} />
          <CardBody><TrendChart data={data.over_time} height={280} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="وضعیت تیکت‌ها" />
          <CardBody><DonutChart data={data.by_status} /></CardBody>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="بر اساس دپارتمان" />
          <CardBody><HorizontalBars data={data.by_department as unknown as Record<string, unknown>[]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="بر اساس اولویت" />
          <CardBody><DonutChart data={data.by_priority} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="رضایت مشتریان" description={data.satisfaction.average ? `میانگین ${formatNumber(data.satisfaction.average)} از ۵ (${formatNumber(data.satisfaction.count)} نظر)` : undefined} />
          <CardBody><RatingDistribution data={data.satisfaction.distribution} /></CardBody>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="زمان پاسخگویی و حل" description="میانگین روزانه (ساعت)" />
          <CardBody><ResponseTimeChart data={data.response_trend} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="عملکرد کارشناسان" actions={<Link href="/reports?tab=agents" className="text-xs text-primary">جزئیات</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-4 py-2 text-start font-medium">کارشناس</th><th className="px-2 py-2 text-start font-medium">تیکت</th><th className="px-2 py-2 text-start font-medium">باز</th><th className="px-2 py-2 text-start font-medium">اولین پاسخ</th><th className="px-2 py-2 text-start font-medium">امتیاز</th></tr></thead>
              <tbody>
                {data.top_agents.map((a) => (
                  <tr key={a.id ?? "none"} className="border-b last:border-0">
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-2 py-2">{formatNumber(a.count)}</td>
                    <td className="px-2 py-2">{formatNumber(a.open)}</td>
                    <td className="px-2 py-2 text-xs">{formatDuration(a.avg_first_response_minutes)}</td>
                    <td className="px-2 py-2 text-xs">{a.rating_avg ? `${formatNumber(a.rating_avg)} ★` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<"admin" | "agent">("admin");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صبح بخیر" : hour < 17 ? "روز بخیر" : "عصر بخیر";

  return (
    <div>
      <PageHeader
        title={`${greeting}، ${user?.full_name?.split(" ")[0] ?? ""}`}
        description={<span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "full" }).format(new Date())}</span>}
        actions={<Link href="/tickets/new"><Button><Plus className="h-4 w-4" /> ثبت تیکت</Button></Link>}
      />
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}
      {data?.type === "admin" && (
        <>
          <Tabs className="mb-5" variant="pill" value={view} onChange={setView} items={[{ value: "admin", label: "نمای مدیریتی" }, { value: "agent", label: "میز کار من" }]} />
          {view === "admin" ? <AdminView data={data.admin} /> : <AgentView data={data.agent} />}
        </>
      )}
      {data?.type === "agent" && <AgentView data={data.agent} />}
    </div>
  );
}
