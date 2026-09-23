import { PageHeader } from "@/components/ui/page-header";
import { TicketCreateForm } from "@/components/tickets/ticket-form";

export const metadata = { title: "ثبت تیکت جدید" };

export default function NewTicketPage() {
  return (
    <div>
      <PageHeader title="ثبت تیکت جدید" description="ثبت درخواست پشتیبانی از طرف مشتری (تماس تلفنی، ایمیل و ...)" breadcrumbs={[{ label: "تیکت‌ها", href: "/tickets" }, { label: "تیکت جدید" }]} />
      <TicketCreateForm mode="staff" />
    </div>
  );
}
