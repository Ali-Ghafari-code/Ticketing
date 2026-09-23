import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "@/lib/constants";
import { useAuthStore } from "@/store/auth";
import { useCompanyContext } from "@/store/company";
import { downloadBlob, filenameFromDisposition } from "@/lib/utils";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 60_000,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

api.interceptors.request.use((config) => {
  const { accessToken, user } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (user?.user_type === "super_admin") {
    const companyId = useCompanyContext.getState().selectedCompanyId;
    if (companyId && !config.headers["X-Company-Id"]) config.headers["X-Company-Id"] = companyId;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ access_token: string }>(`${API_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: { "X-Requested-With": "XMLHttpRequest" },
      })
      .then((res) => {
        useAuthStore.getState().setToken(res.data.access_token);
        return res.data.access_token;
      })
      .catch(() => null)
      .finally(() => {
        setTimeout(() => (refreshPromise = null), 0);
      });
  }
  return refreshPromise;
}

const NO_RETRY = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/reset-password", "/auth/forgot-password"];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? "";
    if (error.response?.status === 401 && original && !original._retry && !NO_RETRY.some((p) => url.includes(p))) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      useAuthStore.getState().clear();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
    }
    return Promise.reject(error);
  },
);

/** Downloads a protected file (export, attachment) with the current credentials. */
export async function downloadFile(url: string, fallbackName = "download", config?: AxiosRequestConfig) {
  const res = await api.get(url, { responseType: "blob", ...config });
  downloadBlob(res.data, filenameFromDisposition(res.headers["content-disposition"], fallbackName));
}

export async function fetchBlobUrl(url: string) {
  const res = await api.get(url, { responseType: "blob" });
  return URL.createObjectURL(res.data);
}
