import { PageHeader } from "@/components/ui/page-header";
import { TicketCreateForm } from "@/components/tickets/ticket-form";

export const metadata = { title: "ثبت تیکت" };

export default function PortalNewTicket() {
  return (
    <div>
      <PageHeader title="ثبت تیکت جدید" description="مشکل یا درخواست خود را با جزئیات شرح دهید تا در سریع‌ترین زمان پاسخ دهیم." breadcrumbs={[{ label: "تیکت‌های من", href: "/portal/tickets" }, { label: "تیکت جدید" }]} />
      <TicketCreateForm mode="portal" />
    </div>
  );
}
