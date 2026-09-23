import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildQuery } from "@/lib/utils";

/**
 * Small factory producing typed TanStack Query hooks for a REST resource:
 * GET /path, POST /path, PUT /path/:id, DELETE /path/:id.
 */
export function createResource<T, TInput = Partial<T>>(path: string, key: string, invalidate: QueryKey[] = []) {
  const listKey = (params?: Record<string, unknown>) => [key, "list", params ?? {}] as const;

  function useList<R = T[]>(params?: Record<string, unknown>, options?: { enabled?: boolean }) {
    return useQuery({
      queryKey: listKey(params),
      enabled: options?.enabled ?? true,
      placeholderData: keepPreviousData,
      queryFn: async () => (await api.get<R>(path, { params: params ? buildQuery(params) : undefined })).data,
    });
  }

  function useItem<R = T>(id?: string | null) {
    return useQuery({
      queryKey: [key, "item", id],
      enabled: !!id,
      queryFn: async () => (await api.get<R>(`${path}/${id}`)).data,
    });
  }

  function useInvalidate() {
    const qc = useQueryClient();
    return () => {
      qc.invalidateQueries({ queryKey: [key] });
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    };
  }

  function useCreate() {
    const done = useInvalidate();
    return useMutation({ mutationFn: async (data: TInput) => (await api.post<T>(path, data)).data, onSuccess: done });
  }

  function useUpdate() {
    const done = useInvalidate();
    return useMutation({
      mutationFn: async ({ id, data }: { id: string; data: TInput }) => (await api.put<T>(`${path}/${id}`, data)).data,
      onSuccess: done,
    });
  }

  function useRemove() {
    const done = useInvalidate();
    return useMutation({ mutationFn: async (id: string) => (await api.delete(`${path}/${id}`)).data, onSuccess: done });
  }

  return { useList, useItem, useCreate, useUpdate, useRemove, useInvalidate, key };
}
