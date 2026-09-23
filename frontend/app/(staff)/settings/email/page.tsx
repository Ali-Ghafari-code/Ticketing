"use client";
import { useState } from "react";
import { CheckCircle2, Mail, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useIntegrations, useTemplates, useTestEmail } from "@/features/settings/api";
import { getErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { SupportSettingsEditor } from "@/components/common/settings-form";

export default function EmailSettingsPage() {
  const integrations = useIntegrations();
  const templates = useTemplates();
  const test = useTestEmail();
  const [to, setTo] = useState("");
  if (integrations.isLoading || templates.isLoading) return <PageLoader />;
  const email = integrations.data!.email;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="اتصال SMTP" icon={<Mail className="h-4 w-4" />} description="اطلاعات SMTP در متغیرهای محیطی سرور (SMTP_HOST، SMTP_PORT، SMTP_USERNAME، SMTP_PASSWORD) تنظیم می‌شود." />
        <CardBody className="grid gap-4 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">سرویس</p><p className="mt-1 font-semibold">{email.provider === "smtp" ? "SMTP" : email.provider === "console" ? "حالت توسعه" : "غیرفعال"}</p></div>
          <div><p className="text-xs text-muted-foreground">وضعیت</p><p className="mt-1">{email.configured ? <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> متصل</Badge> : <Badge tone="warning"><XCircle className="h-3.5 w-3.5" /> تنظیم نشده</Badge>}</p></div>
          <div><p className="text-xs text-muted-foreground">سرور</p><p className="mt-1 font-mono text-sm ltr text-start">{email.host ? `${email.host}:${email.port}` : "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">فرستنده</p><p className="mt-1 text-sm ltr text-start">{email.from}</p></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="ارسال ایمیل آزمایشی" />
        <CardBody className="flex flex-wrap items-end gap-3">
          <FormField label="ایمیل گیرنده" className="w-72"><Input className="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
          <Button loading={test.isPending} disabled={!to} onClick={() => test.mutate(to, { onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(getErrorMessage(e)) })}><Send className="h-4 w-4 -scale-x-100" /> ارسال</Button>
        </CardBody>
      </Card>
      <SupportSettingsEditor>
        {(s, set) => (
          <Card>
            <CardHeader title="قالب‌های ایمیل" description={`عنوان و متن مقدمه هر ایمیل را شخصی‌سازی کنید. متغیرها: ${templates.data!.placeholders.join(" ")}`} />
            <CardBody className="space-y-6">
              {templates.data!.email.map((t) => {
                const value = (s.email_templates ?? {})[t.key] ?? {};
                const patch = (p: { subject?: string; body?: string }) => set({ email_templates: { ...(s.email_templates ?? {}), [t.key]: { ...value, ...p } } });
                return (
                  <div key={t.key} className="rounded-xl border p-4">
                    <p className="mb-3 text-sm font-semibold">{t.label}</p>
                    <div className="grid gap-3">
                      <FormField label="عنوان ایمیل"><Input value={value.subject ?? ""} placeholder={t.default_subject} onChange={(e) => patch({ subject: e.target.value })} /></FormField>
                      <FormField label="متن مقدمه (اختیاری)"><Textarea value={value.body ?? ""} onChange={(e) => patch({ body: e.target.value })} className="min-h-[60px]" /></FormField>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}
      </SupportSettingsEditor>
    </div>
  );
}
