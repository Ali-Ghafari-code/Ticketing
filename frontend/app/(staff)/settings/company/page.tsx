"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentCompany, useUpdateCompany, useUploadLogo } from "@/features/settings/api";
import { fetchMe } from "@/features/auth/api";
import { usePermission } from "@/hooks/use-permission";
import { API_ORIGIN, SUBSCRIPTION_LABELS, WEEKDAYS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { Company, WorkingDay } from "@/types";

type Form = Pick<Company, "name" | "description" | "phone" | "email" | "address" | "website" | "primary_color" | "secondary_color" | "ticket_prefix" | "timezone"> & { working_hours: Record<string, WorkingDay> };

export default function CompanySettingsPage() {
  const { data: company, isLoading } = useCurrentCompany();
  const update = useUpdateCompany();
  const logo = useUploadLogo();
  const { can } = usePermission();
  const [form, setForm] = useState<Form | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (company)
      setForm({
        name: company.name, description: company.description, phone: company.phone, email: company.email, address: company.address,
        website: company.website, primary_color: company.primary_color, secondary_color: company.secondary_color,
        ticket_prefix: company.ticket_prefix, timezone: company.timezone, working_hours: company.working_hours,
      });
  }, [company]);

  if (isLoading || !form || !company) return <PageLoader />;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setDay = (key: string, patch: Partial<WorkingDay>) => set({ working_hours: { ...form.working_hours, [key]: { ...form.working_hours[key], ...patch } } });
  const save = () =>
    update.mutate(
      { ...form, email: form.email || null, website: form.website || null },
      { onSuccess: () => { toast.success("اطلاعات سازمان ذخیره شد"); fetchMe().catch(() => undefined); }, onError: (e) => toast.error(getErrorMessage(e)) },
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="اشتراک" />
        <CardBody className="flex flex-wrap gap-6 text-sm">
          <div><p className="text-xs text-muted-foreground">پلن</p><p className="font-semibold">{company.plan?.name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">وضعیت</p><Badge tone={company.subscription_status === "active" ? "success" : "warning"}>{SUBSCRIPTION_LABELS[company.subscription_status]}</Badge></div>
          <div><p className="text-xs text-muted-foreground">اعتبار تا</p><p>{formatDate(company.subscription_ends_at)}</p></div>
          {company.stats && <div><p className="text-xs text-muted-foreground">کاربران / مشتریان / تیکت‌ها</p><p>{formatNumber(company.stats.staff)} / {formatNumber(company.stats.customers)} / {formatNumber(company.stats.tickets)}</p></div>}
          {company.plan?.max_agents && <div><p className="text-xs text-muted-foreground">سقف کاربران سازمانی</p><p>{formatNumber(company.plan.max_agents)}</p></div>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="اطلاعات سازمان" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {company.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${API_ORIGIN}${company.logo_url}`} alt="لوگو" className="h-full w-full object-cover" />
              ) : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div>
              <Button size="sm" variant="outline" loading={logo.isPending} onClick={() => fileRef.current?.click()} disabled={!can("settings.update")}>بارگذاری لوگو</Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG یا JPG، ترجیحاً مربعی</p>
              <input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0], { onSuccess: () => { toast.success("لوگو به‌روزرسانی شد"); fetchMe().catch(() => undefined); }, onError: (err) => toast.error(getErrorMessage(err)) })} />
            </div>
          </div>
          <FormField label="نام سازمان"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} /></FormField>
          <FormField label="وب‌سایت"><Input className="ltr text-start" value={form.website ?? ""} onChange={(e) => set({ website: e.target.value })} /></FormField>
          <FormField label="تلفن"><Input className="ltr text-start" value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></FormField>
          <FormField label="ایمیل پشتیبانی"><Input className="ltr text-start" value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></FormField>
          <FormField label="آدرس" className="sm:col-span-2"><Input value={form.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></FormField>
          <FormField label="توضیحات" className="sm:col-span-2"><Textarea value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="برند و ظاهر" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <FormField label="رنگ اصلی">
            <div className="flex gap-2"><input type="color" value={form.primary_color} onChange={(e) => set({ primary_color: e.target.value.toUpperCase() })} className="h-10 w-12 cursor-pointer rounded-lg border" aria-label="انتخاب رنگ اصلی" /><Input className="ltr" value={form.primary_color} onChange={(e) => set({ primary_color: e.target.value })} /></div>
          </FormField>
          <FormField label="رنگ ثانویه">
            <div className="flex gap-2"><input type="color" value={form.secondary_color} onChange={(e) => set({ secondary_color: e.target.value.toUpperCase() })} className="h-10 w-12 cursor-pointer rounded-lg border" aria-label="انتخاب رنگ ثانویه" /><Input className="ltr" value={form.secondary_color} onChange={(e) => set({ secondary_color: e.target.value })} /></div>
          </FormField>
          <FormField label="پیشوند شماره تیکت" hint="مثلاً PT ← PT-1024"><Input className="ltr" value={form.ticket_prefix} onChange={(e) => set({ ticket_prefix: e.target.value.toUpperCase() })} maxLength={10} /></FormField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="ساعات کاری پشتیبانی" description="محاسبه مهلت‌های SLA بر اساس این ساعات و تعطیلات انجام می‌شود." />
        <div className="divide-y">
          {WEEKDAYS.map((d) => {
            const day = form.working_hours[d.key] ?? { enabled: false, start: "08:00", end: "17:00" };
            return (
              <div key={d.key} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className="w-28"><Switch checked={day.enabled} onChange={(v) => setDay(d.key, { enabled: v })} label={d.label} /></div>
                {day.enabled ? (
                  <div className="flex items-center gap-2 text-sm">
                    از <Input type="time" className="h-9 w-28 ltr" value={day.start} onChange={(e) => setDay(d.key, { start: e.target.value })} />
                    تا <Input type="time" className="h-9 w-28 ltr" value={day.end} onChange={(e) => setDay(d.key, { end: e.target.value })} />
                  </div>
                ) : <span className="text-xs text-muted-foreground">تعطیل</span>}
              </div>
            );
          })}
        </div>
      </Card>

      {can("settings.update") && (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" loading={update.isPending} onClick={save} className="shadow-pop">ذخیره اطلاعات سازمان</Button>
        </div>
      )}
    </div>
  );
}
