"use client";
import { useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, ChevronsUp, CheckCircle2, Circle, Clock, Minus, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SLA_LABELS } from "@/lib/constants";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SlaStatus, TicketListItem, TicketPriority, TicketStatus } from "@/types";

export function TicketStatusBadge({ status, size }: { status: Pick<TicketStatus, "name" | "color">; size?: "sm" | "md" }) {
  return <Badge color={status.color} dot size={size}>{status.name}</Badge>;
}

const priorityIcons = [Minus, ArrowDown, Minus, ArrowUp, ChevronsUp];

export function PriorityBadge({ priority, size }: { priority: Pick<TicketPriority, "name" | "color" | "level">; size?: "sm" | "md" }) {
  const Icon = priorityIcons[Math.min(priority.level, 4)] ?? Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", size === "sm" ? "text-[0.7rem]" : "text-xs")} style={{ color: priority.color }}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {priority.name}
    </span>
  );
}

const slaMeta: Record<SlaStatus, { icon: typeof Clock; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  none: { icon: Circle, tone: "neutral" },
  healthy: { icon: Clock, tone: "success" },
  warning: { icon: AlertTriangle, tone: "warning" },
  breached: { icon: AlertOctagon, tone: "danger" },
  paused: { icon: PauseCircle, tone: "info" },
  met: { icon: CheckCircle2, tone: "success" },
};

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

type SlaSource = Pick<TicketListItem, "sla_status" | "first_response_due_at" | "resolution_due_at" | "first_responded_at">;

/** SLA indicator: always icon + text (never colour only) with a live countdown. */
export function SlaIndicator({ ticket, compact }: { ticket: SlaSource; compact?: boolean }) {
  const now = useNow();
  const meta = slaMeta[ticket.sla_status] ?? slaMeta.none;
  const Icon = meta.icon;
  const target = !ticket.first_responded_at ? ticket.first_response_due_at : ticket.resolution_due_at;
  const active = ["healthy", "warning", "breached"].includes(ticket.sla_status) && target;
  const remaining = active ? Math.round((new Date(target!).getTime() - now) / 1000) : null;
  const label = SLA_LABELS[ticket.sla_status];
  const title = target ? `${!ticket.first_responded_at ? "مهلت اولین پاسخ" : "مهلت حل"}: ${formatDateTime(target)}` : label;
  return (
    <Badge tone={meta.tone} title={title} aria-label={`وضعیت SLA: ${label}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {compact || remaining === null ? label : formatCountdown(remaining)}
    </Badge>
  );
}

export function SlaDetails({ ticket }: { ticket: SlaSource & { resolution_breached?: boolean; first_response_breached?: boolean } }) {
  const now = useNow(15_000);
  if (ticket.sla_status === "none") return <p className="text-xs text-muted-foreground">قانون SLA برای این تیکت تعریف نشده است.</p>;
  const rows = [
    { label: "اولین پاسخ", due: ticket.first_response_due_at, done: ticket.first_responded_at, breached: ticket.first_response_breached },
    { label: "حل مشکل", due: ticket.resolution_due_at, done: null, breached: ticket.resolution_breached },
  ];
  return (
    <div className="space-y-3">
      <SlaIndicator ticket={ticket} compact />
      {rows.map((r) => {
        if (!r.due) return null;
        const secs = Math.round((new Date(r.due).getTime() - now) / 1000);
        const status = r.done ? (r.breached ? "با تاخیر انجام شد" : "انجام شد") : ticket.sla_status === "paused" ? "متوقف" : formatCountdown(secs);
        return (
          <div key={r.label} className="text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={cn("font-medium", r.breached || (!r.done && secs < 0) ? "text-danger" : r.done ? "text-success" : "")}>{status}</span>
            </div>
            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">سررسید: {formatDateTime(r.due)}</p>
          </div>
        );
      })}
    </div>
  );
}
