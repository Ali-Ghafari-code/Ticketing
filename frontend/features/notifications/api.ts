import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Notification, NotificationSetting, Page } from "@/types";

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "unread"],
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await api.get<{ count: number }>("/notifications/unread-count")).data.count,
  });
}

export function useNotifications(params: { page?: number; page_size?: number; unread_only?: boolean } = {}) {
  return useQuery({
    queryKey: ["notifications", "list", params],
    queryFn: async () => (await api.get<Page<Notification> & { unread: number }>("/notifications", { params })).data,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ["notifications", "settings"],
    queryFn: async () => (await api.get<NotificationSetting[]>("/notifications/settings")).data,
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: NotificationSetting[]) => (await api.put<NotificationSetting[]>("/notifications/settings", { items })).data,
    onSuccess: (data) => qc.setQueryData(["notifications", "settings"], data),
  });
}
