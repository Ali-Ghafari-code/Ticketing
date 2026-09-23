import { create } from "zustand";
import type { Me } from "@/types";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  accessToken: string | null;
  user: Me | null;
  status: Status;
  setToken: (token: string | null) => void;
  setUser: (user: Me | null) => void;
  setStatus: (status: Status) => void;
  clear: () => void;
}

/**
 * The access token is intentionally kept in memory only (never localStorage) so XSS cannot
 * exfiltrate a long-lived credential. The refresh token lives in an httpOnly cookie.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",
  setToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, user: null, status: "unauthenticated" }),
}));
