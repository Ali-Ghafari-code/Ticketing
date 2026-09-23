"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSystemSettings } from "@/features/companies/api";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export default function SystemSettingsPage() {
  const { data, isLoading } = useSystemSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => (await api.put("/system/settings", values)).data,
    onSuccess: (d) => { qc.setQueryData(["system-settings"], d); toast.success("تنظیمات سامانه ذخیره شد"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  if (isLoading || !form) return <PageLoader />;
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  return (
    <div className="max-w-3xl">
      <PageHeader title="تنظیمات سامانه" description="تنظیمات سطح پلتفرم که بر همه سازمان‌ها اثر دارد" />
      <Card>
        <CardHeader title="عمومی" />
        <CardBody className="space-y-5">
          <FormField label="نام سامانه"><Input value={String(form.platform_name ?? "")} onChange={(e) => set("platform_name", e.target.value)} /></FormField>
          <FormField label="ایمیل پشتیبانی سامانه"><Input className="ltr" value={String(form.support_email ?? "")} onChange={(e) => set("support_email", e.target.value)} /></FormField>
          <FormField label="کد پلن پیش‌فرض سازمان‌های جدید"><Input className="ltr" value={String(form.default_plan_code ?? "")} onChange={(e) => set("default_plan_code", e.target.value)} /></FormField>
          <Switch checked={!!form.allow_company_signup} onChange={(v) => set("allow_company_signup", v)} label="امکان ثبت‌نام آزاد سازمان‌ها" />
          <Switch checked={!!form.maintenance_mode} onChange={(v) => set("maintenance_mode", v)} label="حالت تعمیر و نگهداری" />
          <FormField label="پیام حالت تعمیرات"><Textarea value={String(form.maintenance_message ?? "")} onChange={(e) => set("maintenance_message", e.target.value)} /></FormField>
          <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(form)}>ذخیره</Button></div>
        </CardBody>
      </Card>
    </div>
  );
}
