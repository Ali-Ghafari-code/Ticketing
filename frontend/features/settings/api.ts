import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import type { AuditLog, Company, Page } from "@/types";

export function useCurrentCompany(enabled = true) {
  return useQuery({ queryKey: ["company"], enabled, queryFn: async () => (await api.get<Company>("/company")).data });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.put<Company>("/company", data)).data,
    onSuccess: (data) => qc.setQueryData(["company"], data),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<Company>("/company/logo", form)).data;
    },
    onSuccess: (data) => qc.setQueryData(["company"], data),
  });
}

export type SupportSettings = Record<string, unknown> & {
  sms_templates?: Record<string, string>;
  email_templates?: Record<string, { subject?: string; body?: string }>;
};

export function useSupportSettings() {
  return useQuery({ queryKey: ["support-settings"], queryFn: async () => (await api.get<SupportSettings>("/settings/support")).data });
}

export function useUpdateSupportSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.put<SupportSettings>("/settings/support", data)).data,
    onSuccess: (data) => {
      qc.setQueryData(["support-settings"], data);
      qc.invalidateQueries({ queryKey: ["tickets", "meta"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}

export interface TemplatesResponse {
  sms: { key: string; label: string; default: string; value: string | null; lookup: string }[];
  email: { key: string; label: string; default_subject: string; subject: string | null; body: string | null }[];
  placeholders: string[];
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: async () => (await api.get<TemplatesResponse>("/settings/templates")).data });
}

export interface Integrations {
  sms: { provider: string; configured: boolean; sender: string | null; use_verify_lookup: boolean };
  email: { provider: string; configured: boolean; host: string | null; port: number; from: string; tls: boolean };
  uploads: { max_size_mb: number; max_files: number };
  security: { access_token_minutes: number; refresh_token_days: number; max_login_attempts: number; lockout_minutes: number; password_min_length: number };
}

export function useIntegrations() {
  return useQuery({ queryKey: ["integrations"], queryFn: async () => (await api.get<Integrations>("/settings/integrations")).data });
}

export function useTestSms() {
  return useMutation({ mutationFn: async (data: { mobile: string; template: string }) => (await api.post<{ message: string }>("/settings/sms/test", data)).data });
}

export function useTestEmail() {
  return useMutation({ mutationFn: async (email: string) => (await api.post<{ message: string }>("/settings/email/test", { email })).data });
}

export interface AuditFilters {
  q?: string;
  action?: string;
  user_id?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export function useAuditLogs(filters: AuditFilters, platform = false) {
  return useQuery({
    queryKey: ["audit-logs", platform, filters],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<Page<AuditLog>>(platform ? "/system/audit-logs" : "/audit-logs", { params: buildQuery(filters as Record<string, unknown>) })).data,
  });
}

export interface ImportPreview {
  kind: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  columns: { key: string; label: string }[];
  rows: { row: number; data: Record<string, string>; errors: string[]; duplicate: boolean; valid: boolean }[];
}

export function useImportPreview(kind: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post<ImportPreview>(`/import/${kind}/preview`, form)).data;
    },
  });
}

export function useImportCommit(kind: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ImportPreview["rows"]) =>
      (await api.post<{ created: number; skipped: number; errors: { row: number; errors: string[] }[] }>(`/import/${kind}/commit`, { rows })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
