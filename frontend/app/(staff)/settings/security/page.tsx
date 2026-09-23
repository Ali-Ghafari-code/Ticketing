"use client";
import Link from "next/link";
import { KeyRound, Lock, ShieldCheck, Timer } from "lucide-react";
import { useIntegrations } from "@/features/settings/api";
import { formatNumber } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { SupportSettingsEditor } from "@/components/common/settings-form";

export default function SecuritySettingsPage() {
  const { data, isLoading } = useIntegrations();
  if (isLoading || !data) return <PageLoader />;
  const s = data.security;
  const items = [
    { icon: Timer, label: "اعتبار توکن دسترسی", value: `${formatNumber(s.access_token_minutes)} دقیقه` },
    { icon: KeyRound, label: "حداکثر اعتبار نشست (Refresh)", value: `${formatNumber(s.refresh_token_days)} روز، با چرخش توکن` },
    { icon: Lock, label: "قفل موقت پس از", value: `${formatNumber(s.max_login_attempts)} تلاش ناموفق به مدت ${formatNumber(s.lockout_minutes)} دقیقه` },
    { icon: ShieldCheck, label: "حداقل طول رمز عبور", value: `${formatNumber(s.password_min_length)} کاراکتر شامل حروف و اعداد` },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="سیاست‌های امنیتی سامانه" description="این مقادیر در پیکربندی سرور تعیین می‌شوند." />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <div key={i.label} className="flex items-start gap-3 rounded-xl border p-4">
              <i.icon className="mt-0.5 h-5 w-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">{i.label}</p><p className="mt-1 text-sm font-medium">{i.value}</p></div>
            </div>
          ))}
        </CardBody>
      </Card>
      <SupportSettingsEditor>
        {(v, set) => (
          <Card>
            <CardHeader title="تنظیمات امنیتی سازمان" />
            <CardBody className="space-y-5">
              <FormField label="مدت نشست «مرا به خاطر بسپار» (روز)"><Input type="number" min={1} max={90} className="w-40" value={String(v.session_timeout_days ?? 14)} onChange={(e) => set({ session_timeout_days: Number(e.target.value) })} /></FormField>
              <Switch checked={!!v.require_mobile_verification} onChange={(x) => set({ require_mobile_verification: x })} label="الزام تایید شماره موبایل مشتریان" description="کد تایید از طریق سرویس پیامک ارسال می‌شود." />
              <Switch checked={!!v.require_email_verification} onChange={(x) => set({ require_email_verification: x })} label="الزام تایید ایمیل مشتریان" />
            </CardBody>
          </Card>
        )}
      </SupportSettingsEditor>
      <p className="text-xs text-muted-foreground">برای مشاهده ورودهای ناموفق و تغییرات مجوزها به <Link href="/audit-logs" className="text-primary">گزارش فعالیت‌ها</Link> مراجعه کنید.</p>
    </div>
  );
}
