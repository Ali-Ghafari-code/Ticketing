"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, HelpCircle, Home, LifeBuoy, Plus, Ticket } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { API_ORIGIN } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NotificationDropdown } from "./notification-dropdown";
import { UserMenu } from "./user-menu";

const links = [
  { href: "/portal", label: "داشبورد", icon: Home, exact: true },
  { href: "/portal/tickets", label: "تیکت‌های من", icon: Ticket },
  { href: "/portal/kb", label: "پایگاه دانش", icon: BookOpen },
  { href: "/portal/faq", label: "سوالات متداول", icon: HelpCircle },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const company = useAuthStore((s) => s.user?.company);
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/portal" className="flex items-center gap-2.5">
            {company?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_ORIGIN}${company.logo_url}`} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <LifeBuoy className="h-4 w-4" />
              </span>
            )}
            <span className="hidden text-sm font-bold sm:block">{company?.name ?? "پشتیبانی"}</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="منوی پورتال">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive(l.href, l.exact) ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <Link
              href="/portal/tickets/new"
              className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:inline-flex"
            >
              <Plus className="h-4 w-4" /> ثبت تیکت
            </Link>
            <NotificationDropdown allHref="/portal/notifications" />
            <UserMenu profileHref="/portal/profile" settingsHref="/portal/notifications?tab=settings" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      {/* Mobile bottom navigation keeps primary actions reachable */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 backdrop-blur md:hidden" aria-label="ناوبری پایین">
        {[links[0], links[1], { href: "/portal/tickets/new", label: "ثبت تیکت", icon: Plus, exact: true }, links[2], links[3]].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.65rem]", isActive(l.href, l.exact) ? "text-primary" : "text-muted-foreground")}
          >
            <l.icon className={cn("h-5 w-5", l.href === "/portal/tickets/new" && "rounded-full bg-primary p-0.5 text-primary-foreground")} />
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
