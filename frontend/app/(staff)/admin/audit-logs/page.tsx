import { PageHeader } from "@/components/ui/page-header";
import { AuditLogTable } from "@/components/common/audit-log-table";

export const metadata = { title: "فعالیت‌های سامانه" };

export default function PlatformAuditPage() {
  return (
    <div>
      <PageHeader title="فعالیت‌های سامانه" description="گزارش فعالیت همه سازمان‌ها و رویدادهای سطح پلتفرم" />
      <AuditLogTable platform />
    </div>
  );
}
