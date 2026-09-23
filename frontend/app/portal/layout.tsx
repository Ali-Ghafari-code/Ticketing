"use client";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PortalShell } from "@/components/layout/portal-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={["customer"]}>
      <PortalShell>{children}</PortalShell>
    </AuthGuard>
  );
}
