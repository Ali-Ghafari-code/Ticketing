"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Spinner } from "@/components/ui/spinner";
import type { UserType } from "@/types";

export function homeFor(userType?: UserType) {
  return userType === "customer" ? "/portal" : userType === "super_admin" ? "/admin/stats" : "/dashboard";
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
    </div>
  );
}

/** Client-side route protection. The API enforces every permission independently. */
export function AuthGuard({ allow, children }: { allow: UserType[]; children: ReactNode }) {
  const { status, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (status === "authenticated" && user && !allow.includes(user.user_type)) router.replace(homeFor(user.user_type));
  }, [status, user, allow, router, pathname]);

  if (status !== "authenticated" || !user || !allow.includes(user.user_type)) return <FullScreenLoader />;
  return <>{children}</>;
}

export function GuestGuard({ children }: { children: ReactNode }) {
  const { status, user } = useAuthStore();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated" && user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.user_type));
    }
  }, [status, user, router]);
  if (status === "loading") return <FullScreenLoader />;
  return <>{children}</>;
}
