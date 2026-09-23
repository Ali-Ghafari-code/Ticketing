import { type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  href?: string;
  loading?: boolean;
}

const toneClass = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
};

export function StatCard({ label, value, icon, hint, tone = "default", href, loading }: StatCardProps) {
  const content = (
    <div className={cn("group h-full rounded-xl border bg-card p-4 shadow-soft transition", href && "hover:border-primary/40 hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneClass[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">
        {loading ? <span className="inline-block h-7 w-14 animate-pulse rounded bg-muted" /> : typeof value === "number" ? formatNumber(value) : (value ?? "—")}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{content}</Link> : content;
}
