"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration, formatIsoDay, formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";

const PALETTE = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#EC4899", "#64748B", "#F97316"];

const axisStyle = { fontSize: 11, fill: "rgb(var(--muted-foreground))", fontFamily: "Vazirmatn" };
const tooltipStyle = {
  contentStyle: {
    background: "rgb(var(--card))",
    border: "1px solid rgb(var(--border))",
    borderRadius: 10,
    fontFamily: "Vazirmatn",
    fontSize: 12,
    direction: "rtl" as const,
    boxShadow: "0 10px 30px -10px rgb(15 23 42 / .25)",
  },
  labelStyle: { color: "rgb(var(--foreground))", fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
};

function NoData() {
  return <EmptyState compact icon={<BarChart3 className="h-5 w-5" />} title="داده‌ای برای نمایش وجود ندارد" />;
}

export function TrendChart({ data, height = 260 }: { data: { date: string; created: number; resolved: number }[]; height?: number }) {
  if (!data.length) return <NoData />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="date" reversed tickFormatter={formatIsoDay} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis orientation="right" allowDecimals={false} tickFormatter={(v) => formatNumber(v)} tick={axisStyle} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => formatIsoDay(String(l))} formatter={(v: number, name) => [formatNumber(v), name === "created" ? "ایجاد شده" : "حل شده"]} />
        <Legend formatter={(v) => (v === "created" ? "ایجاد شده" : "حل شده")} wrapperStyle={{ fontSize: 12, fontFamily: "Vazirmatn" }} />
        <Area type="monotone" dataKey="created" stroke="#6366F1" strokeWidth={2} fill="url(#gCreated)" />
        <Area type="monotone" dataKey="resolved" stroke="#10B981" strokeWidth={2} fill="url(#gResolved)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240 }: { data: { name: string; count: number; color?: string | null }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <NoData />;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0" style={{ height: Math.min(height, 180) }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color || PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number, n) => [formatNumber(v), n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{formatNumber(total)}</span>
          <span className="text-[0.7rem] text-muted-foreground">تیکت</span>
        </div>
      </div>
      <ul className="min-w-[11rem] flex-1 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="font-medium">{formatNumber(d.count)}</span>
            <span className="w-10 text-left text-muted-foreground">{formatNumber(Math.round((d.count / total) * 100))}٪</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBars({
  data,
  height,
  valueKey = "count",
  valueLabel = "تعداد",
  format = (v: number) => formatNumber(v),
}: {
  data: Record<string, unknown>[];
  height?: number;
  valueKey?: string;
  valueLabel?: string;
  format?: (v: number) => string;
}) {
  if (!data.length) return <NoData />;
  const h = height ?? Math.max(160, data.length * 38);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 4, left: 16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" horizontal={false} />
        <XAxis type="number" reversed tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => format(v)} allowDecimals={false} />
        <YAxis type="category" dataKey="name" orientation="right" tick={{ ...axisStyle, fill: "rgb(var(--foreground))" }} width={120} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgb(var(--muted))" }} formatter={(v: number) => [format(v), valueLabel]} />
        <Bar dataKey={valueKey} radius={[6, 0, 0, 6]} maxBarSize={22}>
          {data.map((d, i) => <Cell key={i} fill={(d.color as string) || PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ResponseTimeChart({ data, height = 240 }: { data: { date: string; avg_first_response_minutes: number | null; avg_resolution_minutes: number | null }[]; height?: number }) {
  if (!data.some((d) => d.avg_first_response_minutes !== null || d.avg_resolution_minutes !== null)) return <NoData />;
  const hours = data.map((d) => ({
    date: d.date,
    first: d.avg_first_response_minutes !== null ? Math.round((d.avg_first_response_minutes / 60) * 10) / 10 : null,
    resolution: d.avg_resolution_minutes !== null ? Math.round((d.avg_resolution_minutes / 60) * 10) / 10 : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={hours} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
        <XAxis dataKey="date" reversed tickFormatter={formatIsoDay} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis orientation="right" tick={axisStyle} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${formatNumber(v)}س`} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => formatIsoDay(String(l))} formatter={(v: number, n) => [formatDuration(v * 60), n === "first" ? "اولین پاسخ" : "زمان حل"]} />
        <Legend formatter={(v) => (v === "first" ? "میانگین اولین پاسخ" : "میانگین زمان حل")} wrapperStyle={{ fontSize: 12, fontFamily: "Vazirmatn" }} />
        <Line type="monotone" dataKey="first" stroke="#0EA5E9" strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="resolution" stroke="#F59E0B" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RatingDistribution({ data }: { data: { rating: number; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-2">
      {[...data].sort((a, b) => b.rating - a.rating).map((d) => {
        const pct = total ? (d.count / total) * 100 : 0;
        return (
          <div key={d.rating} className="flex items-center gap-3 text-xs">
            <span className="w-12 shrink-0">{formatNumber(d.rating)} ستاره</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-left text-muted-foreground">{formatNumber(d.count)}</span>
          </div>
        );
      })}
    </div>
  );
}
