import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { createResource } from "@/lib/resource";
import type { Company, Plan } from "@/types";

export const companiesApi = createResource<Company, Record<string, unknown>>("/companies", "companies");
export const plansApi = createResource<Plan, Record<string, unknown>>("/plans", "plans");

export function useCompanyOptions(enabled = true) {
  return useQuery({
    queryKey: ["companies", "options"],
    enabled,
    queryFn: async () => (await api.get<{ id: string; name: string; slug: string }[]>("/companies/options")).data,
  });
}

export interface PlatformStats {
  companies: number;
  active_companies: number;
  staff: number;
  customers: number;
  tickets: number;
  tickets_this_month: number;
  satisfaction_avg: number | null;
  top_companies: { id: string; name: string; tickets: number }[];
  subscriptions: { status: string; count: number }[];
}

export function usePlatformStats() {
  return useQuery({ queryKey: ["platform-stats"], queryFn: async () => (await api.get<PlatformStats>("/platform/stats")).data });
}

export function useSystemSettings() {
  return useQuery({ queryKey: ["system-settings"], queryFn: async () => (await api.get<Record<string, unknown>>("/system/settings")).data });
}
