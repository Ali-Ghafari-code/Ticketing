"use client";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SupportSettingsEditor } from "@/components/common/settings-form";
import { NotificationSettingsForm } from "@/components/common/notifications-page";

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-6">
      <SupportSettingsEditor>
        {(s, set) => (
          <Card>
            <CardHeader title="کانال‌های اطلاع‌رسانی سازمان" description="غیرفعال کردن هر کانال، ارسال آن را برای همه کاربران سازمان متوقف می‌کند." />
            <CardBody className="space-y-5">
              <Switch checked={!!s.notify_email_enabled} onChange={(v) => set({ notify_email_enabled: v })} label="ارسال اعلان‌های ایمیلی" description={<>قالب‌ها و وضعیت اتصال در <Link className="text-primary" href="/settings/email">تنظیمات ایمیل</Link></>} />
              <Switch checked={!!s.notify_sms_enabled} onChange={(v) => set({ notify_sms_enabled: v })} label="ارسال اعلان‌های پیامکی" description={<>قالب‌ها و وضعیت کاوه‌نگار در <Link className="text-primary" href="/settings/sms">تنظیمات پیامک</Link></>} />
            </CardBody>
          </Card>
        )}
      </SupportSettingsEditor>
      <div>
        <h2 className="mb-3 text-sm font-semibold">تنظیمات شخصی اعلان‌های من</h2>
        <NotificationSettingsForm />
      </div>
    </div>
  );
}
