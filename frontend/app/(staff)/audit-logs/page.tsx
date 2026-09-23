import { PageHeader } from "@/components/ui/page-header";
import { AuditLogTable } from "@/components/common/audit-log-table";

export const metadata = { title: "گزارش فعالیت‌ها" };

export default function AuditLogsPage() {
  return (
    <div>
      <PageHeader title="گزارش فعالیت‌ها" description="ثبت دقیق ورود و خروج، تغییرات تیکت‌ها، کاربران، مجوزها و تنظیمات" />
      <AuditLogTable />
    </div>
  );
}
