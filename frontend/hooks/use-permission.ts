import { useAuthStore } from "@/store/auth";

/** Permission helpers bound to the current user. Super admins implicitly have every permission. */
export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.user_type === "super_admin";
  const set = new Set(user?.permissions ?? []);
  const can = (...codes: string[]) => isSuperAdmin || codes.every((c) => set.has(c));
  const canAny = (...codes: string[]) => isSuperAdmin || codes.some((c) => set.has(c));
  return { user, can, canAny, isSuperAdmin, isCustomer: user?.user_type === "customer", isStaff: user?.user_type !== "customer" };
}
