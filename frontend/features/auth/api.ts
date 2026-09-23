import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Me } from "@/types";

export interface LoginInput {
  identifier: string;
  password: string;
  remember_me?: boolean;
}

export async function fetchMe() {
  const { data } = await api.get<Me>("/auth/me");
  useAuthStore.getState().setUser(data);
  return data;
}

export function useLogin() {
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await api.post<{ access_token: string }>("/auth/login", input);
      useAuthStore.getState().setToken(data.access_token);
      const me = await fetchMe();
      useAuthStore.getState().setStatus("authenticated");
      return me;
    },
  });
}

export interface RegisterInput {
  company_slug: string;
  full_name: string;
  email?: string;
  mobile?: string;
  password: string;
  organization?: string;
}

export function useRegister() {
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { data } = await api.post<{ access_token: string }>("/auth/register", input);
      useAuthStore.getState().setToken(data.access_token);
      const me = await fetchMe();
      useAuthStore.getState().setStatus("authenticated");
      return me;
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (everywhere: boolean = false) => {
      try {
        await api.post("/auth/logout", null, { params: { everywhere } });
      } finally {
        useAuthStore.getState().clear();
        qc.clear();
      }
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (identifier: string) =>
      (await api.post<{ message: string; channel: "sms" | "email" }>("/auth/forgot-password", { identifier })).data,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { token?: string; identifier?: string; code?: string; new_password: string }) =>
      (await api.post<{ message: string }>("/auth/reset-password", input)).data,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { current_password: string; new_password: string }) =>
      (await api.post<{ message: string }>("/auth/change-password", input)).data,
  });
}

export function useSendVerification() {
  return useMutation({
    mutationFn: async (channel: "email" | "sms") => (await api.post("/auth/verify/send", { channel })).data,
  });
}

export function useConfirmVerification() {
  return useMutation({
    mutationFn: async (input: { channel: "email" | "sms"; code: string }) => {
      await api.post("/auth/verify/confirm", input);
      return fetchMe();
    },
  });
}

export interface SessionInfo {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  current: boolean;
}

export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: async () => (await api.get<SessionInfo[]>("/auth/sessions")).data });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function usePublicCompany(slug?: string | null) {
  return useQuery({
    queryKey: ["public-company", slug],
    enabled: !!slug,
    retry: false,
    queryFn: async () =>
      (
        await api.get<{
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          description: string | null;
          primary_color: string;
          allow_registration: boolean;
        }>(`/public/companies/${slug}`)
      ).data,
  });
}
