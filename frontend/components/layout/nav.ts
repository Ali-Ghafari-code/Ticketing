import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  Layers,
  Settings,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  anyOf?: string[];
  superAdminOnly?: boolean;
  needsCompany?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const staffNav: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, needsCompany: true },
      { href: "/tickets", label: "تیکت‌ها", icon: Ticket, anyOf: ["tickets.view", "tickets.view_all"], needsCompany: true },
      { href: "/customers", label: "مشتریان", icon: Users, anyOf: ["customers.view"], needsCompany: true },
      { href: "/reports", label: "گزارش‌ها", icon: BarChart3, anyOf: ["reports.view"], needsCompany: true },
    ],
  },
  {
    title: "سازمان",
    items: [
      { href: "/users", label: "کاربران و کارشناسان", icon: UserCog, anyOf: ["users.view"], needsCompany: true },
      { href: "/departments", label: "دپارتمان‌ها", icon: Layers, anyOf: ["departments.manage"], needsCompany: true },
      { href: "/kb", label: "پایگاه دانش", icon: BookOpen, anyOf: ["kb.manage"], needsCompany: true },
      { href: "/faq", label: "سوالات متداول", icon: HelpCircle, anyOf: ["faq.manage"], needsCompany: true },
      { href: "/import-export", label: "ورود و خروج اطلاعات", icon: FileSpreadsheet, anyOf: ["import.manage", "reports.export"], needsCompany: true },
      { href: "/audit-logs", label: "گزارش فعالیت‌ها", icon: ClipboardList, anyOf: ["audit.view"], needsCompany: true },
      { href: "/settings", label: "تنظیمات", icon: Settings, anyOf: ["settings.view"], needsCompany: true },
    ],
  },
  {
    title: "مدیریت سامانه",
    items: [
      { href: "/admin/stats", label: "آمار سامانه", icon: Gauge, superAdminOnly: true },
      { href: "/admin/companies", label: "سازمان‌ها", icon: Building2, superAdminOnly: true },
      { href: "/admin/plans", label: "پلن‌های اشتراک", icon: CreditCard, superAdminOnly: true },
      { href: "/admin/audit-logs", label: "فعالیت‌های سامانه", icon: ClipboardList, superAdminOnly: true },
      { href: "/admin/system", label: "تنظیمات سامانه", icon: ShieldCheck, superAdminOnly: true },
    ],
  },
];
