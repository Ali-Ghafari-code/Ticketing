"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, PanelRightClose, PanelRightOpen } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { useCompanyContext } from "@/store/company";
import { useUiStore } from "@/store/ui";
import { API_ORIGIN } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { staffNav, type NavItem } from "./nav";

function useVisibleNav() {
  const { canAny, isSuperAdmin } = usePermission();
  const hasCompany = !!useCompanyContext((s) => s.selectedCompanyId);
  return staffNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item: NavItem) => {
        if (item.superAdminOnly) return isSuperAdmin;
        if (isSuperAdmin && item.needsCompany && !hasCompany) return false;
        return !item.anyOf || canAny(...item.anyOf);
      }),
    }))
    .filter((s) => s.items.length);
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = usePermission();
  const sections = useVisibleNav();
  const company = user?.company;
  const companyName = company?.name ?? useCompanyContext.getState().selectedCompanyName ?? "مدیریت سامانه";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-2.5 border-b px-4", collapsed && "justify-center px-2")}>
        {company?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${API_ORIGIN}${company.logo_url}`} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LifeBuoy className="h-4.5 w-4.5" />
          </span>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{companyName}</p>
            <p className="text-[0.7rem] text-muted-foreground">مرکز پشتیبانی</p>
          </div>
        )}
      </div>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-3" aria-label="منوی اصلی">
        {sections.map((section, idx) => (
          <div key={idx}>
            {section.title && !collapsed && (
              <p className="mb-1.5 px-3 text-[0.7rem] font-medium text-muted-foreground">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        collapsed && "justify-center px-2",
                        active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-l bg-card transition-[width] lg:flex",
        sidebarCollapsed ? "w-[4.25rem]" : "w-64",
      )}
    >
      <SidebarContent collapsed={sidebarCollapsed} />
      <button
        onClick={toggleSidebar}
        className="flex h-11 items-center justify-center gap-2 border-t text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={sidebarCollapsed ? "باز کردن منو" : "جمع کردن منو"}
      >
        {sidebarCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        {!sidebarCollapsed && "جمع کردن منو"}
      </button>
    </aside>
  );
}
