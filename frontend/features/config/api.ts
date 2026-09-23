import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { createResource } from "@/lib/resource";
import type { Category, Department, Holiday, SlaRule, Tag, TicketPriority, TicketStatus } from "@/types";

const META = [["tickets", "meta"]];

export const departmentsApi = createResource<Department, Record<string, unknown>>("/departments", "departments", META);
export const categoriesApi = createResource<Category, Record<string, unknown>>("/categories", "categories", META);
export const statusesApi = createResource<TicketStatus, Record<string, unknown>>("/statuses", "statuses", META);
export const prioritiesApi = createResource<TicketPriority, Record<string, unknown>>("/priorities", "priorities", META);
export const tagsApi = createResource<Tag, Record<string, unknown>>("/tags", "tags", META);
export const slaApi = createResource<SlaRule, Record<string, unknown>>("/sla-rules", "sla-rules");
export const holidaysApi = createResource<Holiday, { date: string; title: string }>("/holidays", "holidays");

export function useReorderStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => api.put("/statuses-order", ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statuses"] }),
  });
}
