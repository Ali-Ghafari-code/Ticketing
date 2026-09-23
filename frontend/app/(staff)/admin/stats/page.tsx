"use client";
import { Building2, Inbox, Smile, Ticket, UserCog, Users } from "lucide-react";
import { usePlatformStats } from "@/features/companies/api";
import { SUBSCRIPTION_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { DonutChart, HorizontalBars } from "@/components/charts/charts";

export default function PlatformStatsPage() {
  const { data, isLoading } = usePlatformStats();
  if (isLoading || !data) return <PageLoader />;
  return (
    <div className="space-y-6">
      <PageHeader title="آمار کل سامانه" description="نمای کلی همه سازمان‌ها، کاربران و تیکت‌ها" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="سازمان‌ها" value={data.companies} icon={<Building2 className="h-4 w-4" />} tone="primary" href="/admin/companies" hint={`${formatNumber(data.active_companies)} فعال`} />
        <StatCard label="کارکنان" value={data.staff} icon={<UserCog className="h-4 w-4" />} tone="info" />
        <StatCard label="مشتریان" value={data.customers} icon={<Users className="h-4 w-4" />} />
        <StatCard label="کل تیکت‌ها" value={data.tickets} icon={<Ticket className="h-4 w-4" />} tone="success" />
        <StatCard label="تیکت‌های این ماه" value={data.tickets_this_month} icon={<Inbox className="h-4 w-4" />} />
        <StatCard label="میانگین رضایت" value={data.satisfaction_avg ? `${formatNumber(data.satisfaction_avg)} از ۵` : "—"} icon={<Smile className="h-4 w-4" />} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="سازمان‌های پرتیکت" /><CardBody><HorizontalBars data={data.top_companies.map((c) => ({ name: c.name, count: c.tickets }))} /></CardBody></Card>
        <Card><CardHeader title="وضعیت اشتراک‌ها" /><CardBody><DonutChart data={data.subscriptions.map((s) => ({ name: SUBSCRIPTION_LABELS[s.status] ?? s.status, count: s.count }))} /></CardBody></Card>
      </div>
    </div>
  );
}
