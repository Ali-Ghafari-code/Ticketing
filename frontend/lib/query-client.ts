import { QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          const status = error instanceof AxiosError ? error.response?.status : undefined;
          if (status && status >= 400 && status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
