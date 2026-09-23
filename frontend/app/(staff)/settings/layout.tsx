"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  FolderTree,
  Layers,
  Mail,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Tags,
  Timer,
  UserCog,
  KeyRound,
} from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings", label: "عمومی", icon: Settings2, exact: true },
  { href: "/settings/company", label: "سازمان و برند", icon: Building2 },
  { href: "/users", label: "کاربران", icon: UserCog, perm: "users.view" },
  { href: "/settings/roles", label: "نقش‌ها و مجوزها", icon: KeyRound, perm: "roles.manage" },
  { href: "/departments", label: "دپارتمان‌ها", icon: Layers, perm: "departments.manage" },
  { href: "/settings/tickets", label: "تیکت، وضعیت، اولویت و برچسب", icon: Tags },
  { href: "/settings/categories", label: "دسته‌بندی‌ها", icon: FolderTree },
  { href: "/settings/sla", label: "SLA، ساعات کاری و تعطیلات", icon: Timer },
  { href: "/settings/notifications", label: "اعلان‌ها", icon: Bell },
  { href: "/settings/sms", label: "پیامک (کاوه‌نگار)", icon: MessageSquare },
  { href: "/settings/email", label: "ایمیل", icon: Mail },
  { href: "/kb", label: "پایگاه دانش", icon: BookOpen, perm: "kb.manage" },
  { href: "/settings/security", label: "امنیت", icon: ShieldCheck },
  { href: "/audit-logs", label: "گزارش فعالیت‌ها", icon: ClipboardList, perm: "audit.view" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can } = usePermission();
  const items = SECTIONS.filter((s) => !s.perm || can(s.perm));
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold sm:text-2xl">تنظیمات</h1>
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="بخش‌های تنظیمات">
          {items.map((s) => {
            const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
