"use client";
import { useState } from "react";
import { CheckCircle2, MessageSquare, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useIntegrations, useTemplates, useTestSms } from "@/features/settings/api";
import { getErrorMessage } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { SupportSettingsEditor } from "@/components/common/settings-form";

export default function SmsSettingsPage() {
  const integrations = useIntegrations();
  const templates = useTemplates();
  const test = useTestSms();
  const [mobile, setMobile] = useState("");
  const [template, setTemplate] = useState("verification_code");
  if (integrations.isLoading || templates.isLoading) return <PageLoader />;
  const sms = integrations.data!.sms;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="اتصال به کاوه‌نگار" icon={<MessageSquare className="h-4 w-4" />} description="کلید API و شماره فرستنده فقط در متغیرهای محیطی سرور نگهداری می‌شوند و هرگز به مرورگر ارسال نمی‌شوند." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">سرویس‌دهنده فعال</p><p className="mt-1 font-semibold">{sms.provider === "kavenegar" ? "کاوه‌نگار" : sms.provider === "console" ? "حالت توسعه (ثبت در لاگ)" : "غیرفعال"}</p></div>
          <div><p className="text-xs text-muted-foreground">کلید API</p><p className="mt-1">{sms.configured ? <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> تنظیم شده</Badge> : <Badge tone="danger"><XCircle className="h-3.5 w-3.5" /> تنظیم نشده</Badge>}</p></div>
          <div><p className="text-xs text-muted-foreground">شماره فرستنده</p><p className="mt-1 font-mono ltr text-start">{sms.sender ?? "—"}</p></div>
          <p className="text-xs leading-6 text-muted-foreground sm:col-span-3">
            برای فعال‌سازی، متغیرهای <code className="ltr">SMS_PROVIDER=kavenegar</code>، <code className="ltr">KAVENEGAR_API_KEY</code> و <code className="ltr">KAVENEGAR_SENDER</code> را در فایل <code>.env</code> سرور تنظیم کنید.
            {sms.use_verify_lookup && " ارسال با قالب‌های Verify Lookup پنل کاوه‌نگار فعال است."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="ارسال پیامک آزمایشی" />
        <CardBody className="flex flex-wrap items-end gap-3">
          <FormField label="شماره موبایل" className="w-48"><Input className="ltr" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="09121234567" /></FormField>
          <FormField label="قالب" className="w-56"><Select value={template} onChange={(e) => setTemplate(e.target.value)} options={templates.data!.sms.map((t) => ({ value: t.key, label: t.label }))} /></FormField>
          <Button loading={test.isPending} disabled={!mobile} onClick={() => test.mutate({ mobile, template }, { onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(getErrorMessage(e)) })}><Send className="h-4 w-4 -scale-x-100" /> ارسال</Button>
        </CardBody>
      </Card>

      <SupportSettingsEditor>
        {(s, set) => (
          <Card>
            <CardHeader title="قالب‌های پیامک" description={`متغیرهای قابل استفاده: ${templates.data!.placeholders.join(" ")} — در صورت خالی بودن، متن پیش‌فرض استفاده می‌شود.`} />
            <CardBody className="space-y-5">
              {templates.data!.sms.map((t) => (
                <FormField key={t.key} label={<span className="flex items-center gap-2">{t.label} <span className="font-mono text-[0.7rem] text-muted-foreground ltr">lookup: {t.lookup}</span></span>}>
                  <Textarea
                    value={(s.sms_templates ?? {})[t.key] ?? ""}
                    placeholder={t.default}
                    onChange={(e) => set({ sms_templates: { ...(s.sms_templates ?? {}), [t.key]: e.target.value } })}
                    className="min-h-[72px]"
                  />
                </FormField>
              ))}
            </CardBody>
          </Card>
        )}
      </SupportSettingsEditor>
    </div>
  );
}
