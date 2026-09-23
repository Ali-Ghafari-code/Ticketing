import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { createResource } from "@/lib/resource";
import type { Faq, FaqCategory, KbArticle, KbArticleListItem, KbCategory, Page } from "@/types";

export const kbCategoriesApi = createResource<KbCategory, Record<string, unknown>>("/kb/categories", "kb-categories");
export const faqCategoriesApi = createResource<FaqCategory, Record<string, unknown>>("/faq/categories", "faq-categories");
export const faqApi = createResource<Faq, Record<string, unknown>>("/faq", "faq");

export interface ArticleFilters {
  q?: string;
  category_id?: string;
  tag?: string;
  status?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

export function useArticles(filters: ArticleFilters) {
  return useQuery({
    queryKey: ["kb-articles", "list", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Page<KbArticleListItem>>("/kb/articles", { params: filters })).data,
  });
}

export function useArticle(key: string | null | undefined, track = true) {
  return useQuery({
    queryKey: ["kb-articles", "item", key, track],
    enabled: !!key,
    queryFn: async () => (await api.get<KbArticle>(`/kb/articles/${key}`, { params: { track } })).data,
  });
}

export function useSuggestArticles(q: string) {
  return useQuery({
    queryKey: ["kb-articles", "suggest", q],
    enabled: q.trim().length >= 4,
    queryFn: async () => (await api.get<KbArticleListItem[]>("/kb/suggest", { params: { q } })).data,
  });
}

export function useSaveArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      (id ? await api.put<KbArticle>(`/kb/articles/${id}`, data) : await api.post<KbArticle>("/kb/articles", data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-articles"] }),
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/kb/articles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-articles"] }),
  });
}

export function useArticleFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, helpful }: { key: string; helpful: boolean }) => api.post(`/kb/articles/${key}/feedback`, { helpful }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-articles", "item"] }),
  });
}

export function useReorderFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => api.put("/faq-order", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faq"] }),
  });
}
