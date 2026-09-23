"use client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SupportSettingsEditor } from "@/components/common/settings-form";
import { ASSIGNMENT_LABELS } from "@/lib/constants";

export default function GeneralSettingsPage() {
  return (
    <SupportSettingsEditor>
      {(s, set) => (
        <>
          <Card>
            <CardHeader title="ثبت‌نام و پورتال مشتریان" />
            <CardBody className="space-y-5">
              <Switch checked={!!s.allow_registration} onChange={(v) => set({ allow_registration: v })} label="امکان ثبت‌نام آزاد مشتریان" description="در صورت غیرفعال بودن، فقط کارکنان می‌توانند حساب مشتری ایجاد کنند." />
              <Switch checked={!!s.kb_enabled} onChange={(v) => set({ kb_enabled: v })} label="نمایش پایگاه دانش در پورتال" />
              <Switch checked={!!s.kb_suggest_before_ticket} onChange={(v) => set({ kb_suggest_before_ticket: v })} label="پیشنهاد مقاله پیش از ثبت تیکت" description="هنگام نوشتن موضوع تیکت، مقالات مرتبط به مشتری پیشنهاد می‌شود." />
              <Switch checked={!!s.rating_enabled} onChange={(v) => set({ rating_enabled: v })} label="نظرسنجی رضایت پس از حل تیکت" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="تیکت‌ها" />
            <CardBody className="space-y-5">
              <Switch checked={!!s.require_category} onChange={(v) => set({ require_category: v })} label="الزامی بودن انتخاب دسته‌بندی" />
              <Switch checked={!!s.customer_can_select_priority} onChange={(v) => set({ customer_can_select_priority: v })} label="امکان انتخاب اولویت توسط مشتری" />
              <Switch checked={!!s.customer_can_select_department} onChange={(v) => set({ customer_can_select_department: v })} label="امکان انتخاب دپارتمان توسط مشتری" />
              <Switch checked={!!s.allow_customer_close} onChange={(v) => set({ allow_customer_close: v })} label="امکان بستن تیکت توسط مشتری" />
              <Switch checked={!!s.allow_customer_reopen} onChange={(v) => set({ allow_customer_reopen: v })} label="امکان بازگشایی تیکت توسط مشتری" />
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="مهلت بازگشایی (روز)" hint="۰ = بدون محدودیت"><Input type="number" min={0} value={String(s.reopen_window_days ?? 0)} onChange={(e) => set({ reopen_window_days: Number(e.target.value) })} /></FormField>
                <FormField label="بستن خودکار تیکت‌های حل شده پس از (روز)" hint="۰ = غیرفعال"><Input type="number" min={0} value={String(s.auto_close_resolved_days ?? 0)} onChange={(e) => set({ auto_close_resolved_days: Number(e.target.value) })} /></FormField>
                <FormField label="مهلت ویرایش/حذف پیام (دقیقه)"><Input type="number" min={0} value={String(s.message_edit_window_minutes ?? 0)} onChange={(e) => set({ message_edit_window_minutes: Number(e.target.value) })} /></FormField>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="ارجاع خودکار" description="روش پیش‌فرض برای تیکت‌های بدون دپارتمان؛ هر دپارتمان می‌تواند روش مخصوص خود را داشته باشد." />
            <CardBody className="space-y-5">
              <Switch checked={!!s.auto_assign_enabled} onChange={(v) => set({ auto_assign_enabled: v })} label="فعال‌سازی ارجاع خودکار" description="تیکت‌ها بر اساس دسته‌بندی، دپارتمان و بار کاری به کارشناسان تخصیص داده می‌شوند." />
              <FormField label="روش پیش‌فرض">
                <Select value={String(s.default_assignment_strategy ?? "round_robin")} onChange={(e) => set({ default_assignment_strategy: e.target.value })} options={Object.entries(ASSIGNMENT_LABELS).map(([value, label]) => ({ value, label }))} />
              </FormField>
              <Switch checked={!!s.agent_can_view_department_tickets} onChange={(v) => set({ agent_can_view_department_tickets: v })} label="نمایش تیکت‌های دپارتمان به کارشناسان" description="در غیر این صورت کارشناسان فقط تیکت‌های ارجاع شده به خود را می‌بینند." />
            </CardBody>
          </Card>
        </>
      )}
    </SupportSettingsEditor>
  );
}
