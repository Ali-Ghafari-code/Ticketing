import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { createResource } from "@/lib/resource";
import type { AuditLog, Page, Permission, Role, User, UserBrief } from "@/types";

export interface UserInput {
  full_name?: string;
  email?: string | null;
  mobile?: string | null;
  password?: string | null;
  job_title?: string | null;
  organization?: string | null;
  notes?: string | null;
  role_ids?: string[];
  department_ids?: string[];
  is_active?: boolean;
}

export interface UserDetail {
  user: User;
  stats: { total: number; open: number; pending: number; resolved: number; closed: number };
}

export const usersApi = createResource<User, UserInput>("/users", "users", [["tickets", "meta"]]);
export const customersApi = createResource<User, UserInput>("/customers", "customers");
export const rolesApi = createResource<Role, Record<string, unknown>>("/roles", "roles");

export function usePermissions() {
  return useQuery({ queryKey: ["permissions"], queryFn: async () => (await api.get<Permission[]>("/permissions")).data, staleTime: Infinity });
}

export function useAgents(departmentId?: string) {
  return useQuery({
    queryKey: ["agents", departmentId ?? ""],
    queryFn: async () => (await api.get<UserBrief[]>("/agents", { params: { department_id: departmentId || undefined } })).data,
    staleTime: 60_000,
  });
}

export async function searchMentionable(q: string) {
  return (await api.get<UserBrief[]>("/mentionable", { params: { q } })).data;
}

export async function searchCustomers(q: string) {
  return (await api.get<Page<User>>("/customers", { params: { q, page_size: 10 } })).data.items;
}

export function useResetUserPassword(kind: "users" | "customers") {
  return useMutation({
    mutationFn: async ({ id, new_password, notify }: { id: string; new_password?: string; notify?: boolean }) =>
      (await api.post<{ message: string; temporary_password: string | null }>(`/${kind}/${id}/reset-password`, {
        new_password: new_password || null,
        notify: notify ?? true,
      })).data,
  });
}

export function useUserActivity(id: string, page = 1) {
  return useQuery({
    queryKey: ["users", "activity", id, page],
    queryFn: async () => (await api.get<Page<AuditLog>>(`/users/${id}/activity`, { params: { page, page_size: 10 } })).data,
  });
}
