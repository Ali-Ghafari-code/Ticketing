"use client";
import { type ReactNode } from "react";
import { Menu } from "lucide-react";
import { useUiStore } from "@/store/ui";
import { usePermission } from "@/hooks/use-permission";
import { Drawer } from "@/components/ui/drawer";
import { GlobalSearch, SearchTrigger } from "./global-search";
import { NotificationDropdown } from "./notification-dropdown";
import { Sidebar, SidebarContent } from "./sidebar";
import { UserMenu } from "./user-menu";
import { CompanySwitcher } from "./company-switcher";
import { useCompanyContext } from "@/store/company";

export function AppShell({ children }: { children: ReactNode }) {
  const { mobileNavOpen, setMobileNav } = useUiStore();
  const { isSuperAdmin } = usePermission();
  const hasCompany = !!useCompanyContext((s) => s.selectedCompanyId);
  const companyScoped = !isSuperAdmin || hasCompany;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <Drawer open={mobileNavOpen} onClose={() => setMobileNav(false)} side="start" width="max-w-[17rem]">
        <SidebarContent onNavigate={() => setMobileNav(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="باز کردن منو"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {companyScoped && <SearchTrigger className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted sm:flex" />}
            {isSuperAdmin && <CompanySwitcher />}
          </div>
          <div className="flex items-center gap-1">
            {companyScoped && <SearchTrigger className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:hidden [&>span]:hidden [&>kbd]:hidden" />}
            <NotificationDropdown />
            <UserMenu settingsHref="/notifications?tab=settings" />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
      {companyScoped && <GlobalSearch />}
    </div>
  );
}
