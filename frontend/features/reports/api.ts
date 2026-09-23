import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import type { BreakdownRow, DateCount, ResponseTrendRow, Summary, TicketListItem, TicketStats } from "@/types";

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  department_id?: string;
  agent_id?: string;
  category_id?: string;
  status_id?: string;
  priority_id?: string;
}

export interface AgentDashboard {
  counts: {
    assigned: number;
    unassigned: number;
    new: number;
    pending: number;
    overdue: number;
    sla_breaches: number;
    waiting_customer: number;
    waiting_support: number;
    sla_warnings: number;
  };
  avg_first_response_minutes: number | null;
  avg_resolution_minutes: number | null;
  by_status: BreakdownRow[];
  by_priority: BreakdownRow[];
  by_category: BreakdownRow[];
  over_time: DateCount[];
  response_trend: ResponseTrendRow[];
}

export interface AdminDashboard {
  summary: Summary;
  over_time: DateCount[];
  by_status: BreakdownRow[];
  by_priority: BreakdownRow[];
  by_category: BreakdownRow[];
  by_department: BreakdownRow[];
  top_agents: BreakdownRow[];
  response_trend: ResponseTrendRow[];
  satisfaction: { average: number | null; count: number; distribution: { rating: number; count: number }[] };
}

export type DashboardResponse =
  | { type: "customer"; stats: TicketStats }
  | { type: "agent"; agent: AgentDashboard }
  | { type: "admin"; agent: AgentDashboard; admin: AdminDashboard };

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    refetchInterval: 60_000,
    queryFn: async () => (await api.get<DashboardResponse>("/dashboard")).data,
  });
}

export interface TicketsReport {
  summary: Summary;
  by_date: DateCount[];
  by_department: BreakdownRow[];
  by_agent: BreakdownRow[];
  by_category: BreakdownRow[];
  by_priority: BreakdownRow[];
  by_status: BreakdownRow[];
  response_trend: ResponseTrendRow[];
}

export function useTicketsReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "tickets", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<TicketsReport>("/reports/tickets", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}

export interface SatisfactionReport {
  average: number | null;
  count: number;
  distribution: { rating: number; count: number }[];
  by_agent: { id: string; name: string; average: number; count: number }[];
  by_department: { id: string; name: string; average: number; count: number }[];
  trend: { date: string; average: number; count: number }[];
  feedback: { id: string; ticket_id: string; rating: number; feedback: string; customer: string | null; agent: string | null; created_at: string }[];
}

export function useSatisfactionReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "satisfaction", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<SatisfactionReport>("/reports/satisfaction", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}

export interface SlaReport {
  compliance: number | null;
  met: number;
  breached: number;
  warning: number;
  by_priority: BreakdownRow[];
  by_department: BreakdownRow[];
}

export function useSlaReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "sla", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<SlaReport>("/reports/sla", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}

export function useReopenedReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["reports", "reopened", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<TicketListItem[]>("/reports/reopened", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}
