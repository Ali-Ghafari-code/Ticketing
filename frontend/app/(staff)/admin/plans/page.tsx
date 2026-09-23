"use client";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { plansApi } from "@/features/companies/api";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Plan } from "@/types";

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const create = plansApi.useCreate();
  const update = plansApi.useUpdate();
  const [form, setForm] = useState({
    name: plan?.name ?? "", code: plan?.code ?? "", description: plan?.description ?? "", price_monthly: plan?.price_monthly ?? 0,
    max_agents: plan?.max_agents ?? null as number | null, max_customers: plan?.max_customers ?? null as number | null,
    max_tickets_per_month: plan?.max_tickets_per_month ?? null as number | null, max_storage_mb: plan?.max_storage_mb ?? null as number | null,
    features: (plan?.features ?? []).join("\n"), is_active: plan?.is_active ?? true, sort_order: plan?.sort_order ?? 0,
  });
  const num = (v: string) => (v === "" ? null : Math.max(1, Number(v)));
  const submit = () => {
    const data = { ...form, features: form.features.split("\n").map((f) => f.trim()).filter(Boolean) };
    const opts = { onSuccess: () => { toast.success("پلن ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (plan) update.mutate({ id: plan.id, data }, opts);
    else create.mutate(data, opts);
  };
  return (
    <Modal open onClose={onClose} size="lg" title={plan ? "ویرایش پلن" : "پلن جدید"} footer={<Button loading={create.isPending || update.isPending} onClick={submit}>ذخیره</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام پلن"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="کد"><Input className="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} /></FormField>
        <FormField label="قیمت ماهانه (تومان)"><Input type="number" min={0} value={String(form.price_monthly)} onChange={(e) => setForm({ ...form, price_monthly: Number(e.target.value) })} /></FormField>
        <FormField label="ترتیب نمایش"><Input type="number" value={String(form.sort_order)} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></FormField>
        <FormField label="حداکثر کاربران سازمانی" hint="خالی = نامحدود"><Input type="number" value={form.max_agents ?? ""} onChange={(e) => setForm({ ...form, max_agents: num(e.target.value) })} /></FormField>
        <FormField label="حداکثر مشتریان" hint="خالی = نامحدود"><Input type="number" value={form.max_customers ?? ""} onChange={(e) => setForm({ ...form, max_customers: num(e.target.value) })} /></FormField>
        <FormField label="حداکثر تیکت ماهانه" hint="خالی = نامحدود"><Input type="number" value={form.max_tickets_per_month ?? ""} onChange={(e) => setForm({ ...form, max_tickets_per_month: num(e.target.value) })} /></FormField>
        <FormField label="فضای ذخیره‌سازی (MB)" hint="خالی = نامحدود"><Input type="number" value={form.max_storage_mb ?? ""} onChange={(e) => setForm({ ...form, max_storage_mb: num(e.target.value) })} /></FormField>
        <FormField label="توضیحات" className="sm:col-span-2"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
        <FormField label="امکانات (هر خط یک مورد)" className="sm:col-span-2"><Textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></FormField>
        <Switch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="پلن فعال" />
      </div>
    </Modal>
  );
}

export default function PlansPage() {
  const { data, isLoading } = plansApi.useList<Plan[]>();
  const remove = plansApi.useRemove();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });
  if (isLoading) return <PageLoader />;
  const limit = (v: number | null, unit: string) => (v ? `${formatNumber(v)} ${unit}` : `نامحدود`);
  return (
    <div>
      <PageHeader title="پلن‌های اشتراک" description="تعریف پلن‌ها و محدودیت‌های هر سازمان" actions={<Button onClick={() => setModal({ open: true, plan: null })}><Plus className="h-4 w-4" /> پلن جدید</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className="flex flex-col p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="font-mono text-xs text-muted-foreground ltr text-start">{p.code}</p>
              </div>
              {!p.is_active && <Badge>غیرفعال</Badge>}
            </div>
            <p className="mt-4 text-2xl font-bold">{formatPrice(p.price_monthly)} <span className="text-xs font-normal text-muted-foreground">/ ماهانه</span></p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li>کاربران: {limit(p.max_agents, "نفر")}</li>
              <li>مشتریان: {limit(p.max_customers, "نفر")}</li>
              <li>تیکت ماهانه: {limit(p.max_tickets_per_month, "عدد")}</li>
              {p.features.map((f) => <li key={f} className="flex items-center gap-2 text-muted-foreground"><Check className="h-4 w-4 text-success" /> {f}</li>)}
            </ul>
            <div className="mt-auto flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">{formatNumber(p.companies_count)} سازمان</span>
              <div className="flex">
                <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => setModal({ open: true, plan: p })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => { if (await confirm({ title: `حذف پلن ${p.name}` })) remove.mutate(p.id, { onSuccess: () => toast.success("پلن حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {modal.open && <PlanModal plan={modal.plan} onClose={() => setModal({ open: false, plan: null })} />}
    </div>
  );
}
