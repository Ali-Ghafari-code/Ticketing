import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import type {
  Attachment,
  Page,
  Rating,
  TicketActivity,
  TicketDetail,
  TicketListItem,
  TicketMessage,
  TicketMeta,
  TicketStats,
} from "@/types";

export interface TicketFilters {
  q?: string;
  status_id?: string[];
  state?: string;
  priority_id?: string[];
  category_id?: string;
  department_id?: string;
  agent?: string;
  customer_id?: string;
  tag_id?: string[];
  sla_status?: string[];
  date_from?: string;
  date_to?: string;
  escalated?: boolean;
  overdue?: boolean;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export const ticketKeys = {
  all: ["tickets"] as const,
  list: (f: TicketFilters) => ["tickets", "list", f] as const,
  detail: (id: string) => ["tickets", "detail", id] as const,
  messages: (id: string, q?: string) => ["tickets", "messages", id, q ?? ""] as const,
  activities: (id: string) => ["tickets", "activities", id] as const,
  meta: ["tickets", "meta"] as const,
  stats: ["tickets", "stats"] as const,
};

export function useTicketMeta() {
  return useQuery({
    queryKey: ticketKeys.meta,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<TicketMeta>("/tickets/meta")).data,
  });
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Page<TicketListItem>>("/tickets", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}

export function useTicketStats() {
  return useQuery({ queryKey: ticketKeys.stats, queryFn: async () => (await api.get<TicketStats>("/tickets/stats")).data });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: async () => (await api.get<TicketDetail>(`/tickets/${id}`)).data,
    refetchInterval: 60_000,
  });
}

export function useTicketMessages(id: string, q?: string) {
  return useQuery({
    queryKey: ticketKeys.messages(id, q),
    queryFn: async () => (await api.get<TicketMessage[]>(`/tickets/${id}/messages`, { params: { q: q || undefined } })).data,
    refetchInterval: q ? false : 30_000,
  });
}

export function useTicketActivities(id: string, enabled = true) {
  return useQuery({
    queryKey: ticketKeys.activities(id),
    enabled,
    queryFn: async () => (await api.get<TicketActivity[]>(`/tickets/${id}/activities`)).data,
  });
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  category_id?: string | null;
  department_id?: string | null;
  priority_id?: string | null;
  customer_id?: string | null;
  assigned_agent_id?: string | null;
  tag_ids?: string[];
  due_date?: string | null;
  channel?: string;
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, files }: { data: CreateTicketInput; files: File[] }) => {
      const form = new FormData();
      form.append("payload", JSON.stringify(data));
      files.forEach((f) => form.append("files", f));
      return (await api.post<{ id: string; code: string; number: number; message: string }>("/tickets", form)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketKeys.all }),
  });
}

export interface UpdateTicketInput {
  subject?: string;
  description?: string;
  category_id?: string | null;
  department_id?: string | null;
  priority_id?: string;
  status_id?: string;
  assigned_agent_id?: string | null;
  tag_ids?: string[];
  due_date?: string | null;
  clear_assignee?: boolean;
  clear_due_date?: boolean;
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTicketInput }) =>
      (await api.put<TicketDetail>(`/tickets/${id}`, data)).data,
    onSuccess: (ticket) => {
      qc.setQueryData(ticketKeys.detail(ticket.id), ticket);
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      qc.invalidateQueries({ queryKey: ticketKeys.activities(ticket.id) });
      qc.invalidateQueries({ queryKey: ["tickets", "messages", ticket.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useBulkUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { ticket_ids: string[]; status_id?: string; priority_id?: string; assigned_agent_id?: string; clear_assignee?: boolean; add_tag_ids?: string[] }) =>
      (await api.post<{ message: string }>("/tickets/bulk", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketKeys.all }),
  });
}

function useTicketAction<T = void>(path: string, method: "post" | "delete" = "post") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body?: T }) => (await api.request({ url: `/tickets/${id}${path}`, method, data: body })).data,
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["tickets", "messages", id] });
      qc.invalidateQueries({ queryKey: ticketKeys.activities(id) });
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      qc.invalidateQueries({ queryKey: ticketKeys.stats });
    },
  });
}

export const useEscalateTicket = () => useTicketAction<{ reason: string; assigned_agent_id?: string | null; department_id?: string | null }>("/escalate");
export const useCloseTicket = () => useTicketAction("/close");
export const useReopenTicket = () => useTicketAction("/reopen");
export const useDeleteTicket = () => useTicketAction("", "delete");
export const useRateTicket = () => useTicketAction<{ rating: number; feedback?: string }>("/rating");

export function useMarkRead() {
  return useMutation({ mutationFn: async (id: string) => api.post(`/tickets/${id}/read`) });
}

export function useSendMessage(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, isInternal, files }: { body: string; isInternal: boolean; files: File[] }) => {
      const form = new FormData();
      form.append("body", body);
      form.append("is_internal", String(isInternal));
      files.forEach((f) => form.append("files", f));
      return (await api.post<TicketMessage>(`/tickets/${ticketId}/messages`, form)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", "messages", ticketId] });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
      qc.invalidateQueries({ queryKey: ticketKeys.activities(ticketId) });
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
    },
  });
}

export function useEditMessage(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      (await api.put<TicketMessage>(`/tickets/${ticketId}/messages/${id}`, { body })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets", "messages", ticketId] }),
  });
}

export function useDeleteMessage(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/tickets/${ticketId}/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", "messages", ticketId] });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
    },
  });
}

export function useUploadAttachments(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, isInternal }: { files: File[]; isInternal?: boolean }) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      form.append("is_internal", String(!!isInternal));
      return (await api.post<Attachment[]>(`/tickets/${ticketId}/attachments`, form)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) }),
  });
}

export type { Rating };
