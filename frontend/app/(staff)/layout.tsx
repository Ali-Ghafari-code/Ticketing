"use client";
import { usePathname } from "next/navigation";
import { Building2, ShieldOff } from "lucide-react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/auth";
import { useCompanyContext } from "@/store/company";
import { usePermission } from "@/hooks/use-permission";

const PLATFORM_PATHS = ["/admin", "/profile", "/notifications"];

/** Longest matching prefix wins. The API enforces the same permissions; this only avoids dead-end pages. */
const ROUTE_PERMISSIONS: [string, string[]][] = [
  ["/tickets", ["tickets.view", "tickets.view_all"]],
  ["/tickets/new", ["tickets.create"]],
  ["/customers", ["customers.view"]],
  ["/users", ["users.view"]],
  ["/reports", ["reports.view"]],
  ["/departments", ["departments.manage"]],
  ["/kb/new", ["kb.manage"]],
  ["/kb/edit", ["kb.manage"]],
  ["/faq", ["faq.manage"]],
  ["/import-export", ["import.manage", "reports.export"]],
  ["/audit-logs", ["audit.view"]],
  ["/settings", ["settings.view"]],
  ["/settings/roles", ["roles.manage"]],
];

function requiredFor(pathname: string): string[] | null {
  if (pathname === "/kb") return ["kb.manage"];
  const match = ROUTE_PERMISSIONS.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match ? match[1] : null;
}

function PermissionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canAny } = usePermission();
  const required = requiredFor(pathname);
  if (required && !canAny(...required)) {
    return (
      <EmptyState
        icon={<ShieldOff className="h-6 w-6" />}
        title="به این بخش دسترسی ندارید"
        description="نقش کاربری شما مجوز مشاهده این صفحه را ندارد. در صورت نیاز با مدیر سازمان تماس بگیرید."
      />
    );
  }
  return <>{children}</>;
}

function CompanyGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSuper = useAuthStore((s) => s.user?.user_type === "super_admin");
  const companyId = useCompanyContext((s) => s.selectedCompanyId);
  if (isSuper && !companyId && !PLATFORM_PATHS.some((p) => pathname.startsWith(p))) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="ابتدا یک سازمان انتخاب کنید"
        description="شما مدیر کل سامانه هستید. برای مشاهده و مدیریت تیکت‌ها، مشتریان و تنظیمات، سازمان مورد نظر را انتخاب کنید."
        action={<CompanySwitcher />}
      />
    );
  }
  return <>{children}</>;
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={["staff", "super_admin"]}>
      <AppShell>
        <CompanyGate>
          <PermissionGate>{children}</PermissionGate>
        </CompanyGate>
      </AppShell>
    </AuthGuard>
  );
}
