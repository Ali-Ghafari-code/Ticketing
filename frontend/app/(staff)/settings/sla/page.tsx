"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarOff, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { departmentsApi, holidaysApi, prioritiesApi, slaApi } from "@/features/config/api";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatDuration, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Department, Holiday, SlaRule, TicketPriority } from "@/types";

function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const unit = minutes % 1440 === 0 && minutes >= 1440 ? 1440 : minutes % 60 === 0 && minutes >= 60 ? 60 : 1;
  const [u, setU] = useState(unit);
  return (
    <div className="flex gap-2">
      <Input type="number" min={1} value={String(Math.round(minutes / u))} onChange={(e) => onChange(Math.max(1, Number(e.target.value)) * u)} />
      <Select className="w-28" value={String(u)} onChange={(e) => { const nu = Number(e.target.value); setU(nu); onChange(Math.max(1, Math.round(minutes / u)) * nu); }} options={[{ value: "1", label: "دقیقه" }, { value: "60", label: "ساعت" }, { value: "1440", label: "روز" }]} />
    </div>
  );
}

function RuleModal({ rule, onClose }: { rule: Partial<SlaRule> | null; onClose: () => void }) {
  const create = slaApi.useCreate();
  const update = slaApi.useUpdate();
  const priorities = prioritiesApi.useList<TicketPriority[]>();
  const departments = departmentsApi.useList<Department[]>();
  const [form, setForm] = useState({
    name: rule?.name ?? "", description: rule?.description ?? "", priority_id: rule?.priority_id ?? "", department_id: rule?.department_id ?? "",
    first_response_minutes: rule?.first_response_minutes ?? 60, resolution_minutes: rule?.resolution_minutes ?? 480,
    warning_percent: rule?.warning_percent ?? 75, business_hours_only: rule?.business_hours_only ?? true, is_active: rule?.is_active ?? true,
  });
  const submit = () => {
    const data = { ...form, priority_id: form.priority_id || null, department_id: form.department_id || null, description: form.description || null };
    const opts = { onSuccess: () => { toast.success("قانون SLA ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (rule?.id) update.mutate({ id: rule.id, data }, opts);
    else create.mutate(data, opts);
  };
  return (
    <Modal open onClose={onClose} size="lg" title={rule?.id ? "ویرایش قانون SLA" : "قانون SLA جدید"} footer={<Button loading={create.isPending || update.isPending} onClick={submit} disabled={form.name.trim().length < 2}>ذخیره</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام قانون" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: SLA تیکت‌های فوری پشتیبانی فنی" /></FormField>
        <FormField label="اولویت" hint="خالی = همه اولویت‌ها"><Select value={form.priority_id} onChange={(e) => setForm({ ...form, priority_id: e.target.value })} placeholder="همه اولویت‌ها" options={(priorities.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></FormField>
        <FormField label="دپارتمان" hint="خالی = همه دپارتمان‌ها"><Select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} placeholder="همه دپارتمان‌ها" options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></FormField>
        <FormField label="مهلت اولین پاسخ"><DurationInput minutes={form.first_response_minutes} onChange={(m) => setForm({ ...form, first_response_minutes: m })} /></FormField>
        <FormField label="مهلت حل مشکل"><DurationInput minutes={form.resolution_minutes} onChange={(m) => setForm({ ...form, resolution_minutes: m })} /></FormField>
        <FormField label="آستانه هشدار (درصد زمان سپری شده)"><Input type="number" min={10} max={99} value={String(form.warning_percent)} onChange={(e) => setForm({ ...form, warning_percent: Number(e.target.value) })} /></FormField>
        <div className="space-y-3 pt-6">
          <Switch checked={form.business_hours_only} onChange={(v) => setForm({ ...form, business_hours_only: v })} label="فقط در ساعات کاری" description="تعطیلات و خارج از ساعت کاری محاسبه نمی‌شود." />
          <Switch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="فعال" />
        </div>
      </div>
      <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">
        در صورت تطابق چند قانون با یک تیکت، قانون دقیق‌تر اعمال می‌شود: «اولویت + دپارتمان» ← «فقط اولویت» ← «فقط دپارتمان» ← «عمومی».
      </p>
    </Modal>
  );
}

export default function SlaPage() {
  const rules = slaApi.useList<SlaRule[]>();
  const holidays = holidaysApi.useList<Holiday[]>();
  const removeRule = slaApi.useRemove();
  const addHoliday = holidaysApi.useCreate();
  const removeHoliday = holidaysApi.useRemove();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<SlaRule> | null | undefined>(undefined);
  const [holiday, setHoliday] = useState<{ date: string | null; title: string }>({ date: null, title: "" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="قوانین SLA" icon={<Timer className="h-4 w-4" />} description="تعریف مهلت اولین پاسخ و حل مشکل بر اساس اولویت و دپارتمان" actions={<Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> قانون جدید</Button>} />
        {rules.data?.length === 0 && <EmptyState compact title="قانون SLA تعریف نشده است" />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-4 py-2 text-start font-medium">نام</th><th className="px-3 py-2 text-start font-medium">اعمال بر</th><th className="px-3 py-2 text-start font-medium">اولین پاسخ</th><th className="px-3 py-2 text-start font-medium">حل مشکل</th><th className="px-3 py-2 text-start font-medium">مبنای زمان</th><th /></tr></thead>
            <tbody>
              {rules.data?.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.name} {!r.is_active && <Badge size="sm">غیرفعال</Badge>}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.priority ? <Badge color={r.priority.color} size="sm">{r.priority.name}</Badge> : <Badge size="sm">همه اولویت‌ها</Badge>}{r.department ? <Badge tone="info" size="sm">{r.department.name}</Badge> : null}</div></td>
                  <td className="px-3 py-2.5 text-xs">{formatDuration(r.first_response_minutes)}</td>
                  <td className="px-3 py-2.5 text-xs">{formatDuration(r.resolution_minutes)}</td>
                  <td className="px-3 py-2.5 text-xs">{r.business_hours_only ? "ساعات کاری" : "۲۴ ساعته"}</td>
                  <td className="px-3 py-2.5 text-end">
                    <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => { if (await confirm({ title: `حذف ${r.name}` })) removeRule.mutate(r.id, { onSuccess: () => toast.success("حذف شد") }); }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="تعطیلات" icon={<CalendarOff className="h-4 w-4" />} description={<>روزهای تعطیل در محاسبه SLA لحاظ نمی‌شوند. ساعات کاری هفتگی را در <Link href="/settings/company" className="text-primary">تنظیمات سازمان</Link> تعیین کنید.</>} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <FormField label="تاریخ" className="w-48"><DatePicker value={holiday.date} onChange={(date) => setHoliday({ ...holiday, date })} /></FormField>
            <FormField label="عنوان" className="min-w-[12rem] flex-1"><Input value={holiday.title} onChange={(e) => setHoliday({ ...holiday, title: e.target.value })} placeholder="مثلاً: عید نوروز" /></FormField>
            <Button disabled={!holiday.date || !holiday.title} loading={addHoliday.isPending} onClick={() => addHoliday.mutate({ date: holiday.date!, title: holiday.title }, { onSuccess: () => { toast.success("تعطیلی ثبت شد"); setHoliday({ date: null, title: "" }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>
              <Plus className="h-4 w-4" /> افزودن
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {holidays.data?.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">تعطیلی ثبت نشده است</li>}
            {holidays.data?.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{formatDate(h.date + "T12:00:00")} — {h.title}</span>
                <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={() => removeHoliday.mutate(h.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{formatNumber(holidays.data?.length ?? 0)} روز تعطیل ثبت شده</p>
        </CardBody>
      </Card>
      {editing !== undefined && <RuleModal rule={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
