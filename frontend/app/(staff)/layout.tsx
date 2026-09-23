"use client";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/auth";
import { useCompanyContext } from "@/store/company";

const PLATFORM_PATHS = ["/admin", "/profile", "/notifications"];

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
        <CompanyGate>{children}</CompanyGate>
      </AppShell>
    </AuthGuard>
  );
}
