"use client";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Layers, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { departmentsApi } from "@/features/config/api";
import { usersApi } from "@/features/users/api";
import { ASSIGNMENT_LABELS } from "@/lib/constants";
import { applyFieldErrors, getErrorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Department, Page, User } from "@/types";

interface FormValues {
  name: string;
  description: string;
  email: string;
  manager_id: string;
  assignment_strategy: string;
  is_active: boolean;
  member_ids: string[];
}

function DepartmentModal({ open, onClose, dept }: { open: boolean; onClose: () => void; dept?: Department | null }) {
  const create = departmentsApi.useCreate();
  const update = departmentsApi.useUpdate();
  const staff = usersApi.useList<Page<User>>({ page_size: 100, is_active: true }, { enabled: open });
  const { register, handleSubmit, reset, control, setError, formState: { errors } } = useForm<FormValues>();
  useEffect(() => {
    if (open)
      reset({
        name: dept?.name ?? "",
        description: dept?.description ?? "",
        email: dept?.email ?? "",
        manager_id: dept?.manager_id ?? "",
        assignment_strategy: dept?.assignment_strategy ?? "round_robin",
        is_active: dept?.is_active ?? true,
        member_ids: dept?.members.map((m) => m.id) ?? [],
      });
  }, [open, dept, reset]);
  const submit = handleSubmit((v) => {
    if (v.name.trim().length < 2) return setError("name", { message: "نام دپارتمان را وارد کنید" });
    const data = { ...v, manager_id: v.manager_id || null, email: v.email || null, description: v.description || null };
    const opts = { onSuccess: () => { toast.success("دپارتمان ذخیره شد"); onClose(); }, onError: (e: unknown) => { applyFieldErrors(e, setError); toast.error(getErrorMessage(e)); } };
    if (dept) update.mutate({ id: dept.id, data }, opts);
    else create.mutate(data, opts);
  });
  const people = staff.data?.items ?? [];
  return (
    <Modal open={open} onClose={onClose} size="lg" title={dept ? "ویرایش دپارتمان" : "دپارتمان جدید"} footer={<><Button variant="outline" onClick={onClose}>انصراف</Button><Button loading={create.isPending || update.isPending} onClick={submit}>ذخیره</Button></>}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام دپارتمان" required error={errors.name?.message}><Input {...register("name")} invalid={!!errors.name} /></FormField>
        <FormField label="ایمیل دپارتمان"><Input className="ltr text-start" {...register("email")} /></FormField>
        <FormField label="توضیحات" className="sm:col-span-2"><Textarea {...register("description")} className="min-h-[70px]" /></FormField>
        <FormField label="مدیر دپارتمان"><Select {...register("manager_id")} placeholder="— انتخاب کنید —" options={people.map((p) => ({ value: p.id, label: p.full_name }))} /></FormField>
        <FormField label="روش ارجاع خودکار" hint="نحوه تخصیص تیکت‌های جدید این دپارتمان به کارشناسان">
          <Select {...register("assignment_strategy")} options={Object.entries(ASSIGNMENT_LABELS).map(([value, label]) => ({ value, label }))} />
        </FormField>
        <FormField label="کارشناسان دپارتمان" className="sm:col-span-2">
          <Controller
            control={control}
            name="member_ids"
            render={({ field }) => (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {people.map((p) => {
                  const on = field.value?.includes(p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== p.id) : [...field.value, p.id])} className="accent-[rgb(var(--primary))]" />
                      <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                      <span className="truncate">{p.full_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          />
        </FormField>
        <Controller control={control} name="is_active" render={({ field }) => <Switch className="sm:col-span-2" checked={field.value} onChange={field.onChange} label="دپارتمان فعال" />} />
      </form>
    </Modal>
  );
}

export default function DepartmentsPage() {
  const { data, isLoading } = departmentsApi.useList<Department[]>();
  const remove = departmentsApi.useRemove();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; dept?: Department | null }>({ open: false });
  return (
    <div>
      <PageHeader title="دپارتمان‌ها" description="ساختار تیم پشتیبانی، مدیران، کارشناسان و روش ارجاع خودکار" actions={<Button onClick={() => setModal({ open: true, dept: null })}><Plus className="h-4 w-4" /> دپارتمان جدید</Button>} />
      {isLoading && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>}
      {data?.length === 0 && <EmptyState icon={<Layers className="h-6 w-6" />} title="هنوز دپارتمانی تعریف نشده" action={<Button onClick={() => setModal({ open: true })}>ایجاد دپارتمان</Button>} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((d) => (
          <Card key={d.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{d.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{d.description ?? "—"}</p>
              </div>
              {!d.is_active && <Badge>غیرفعال</Badge>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Badge tone="info">{ASSIGNMENT_LABELS[d.assignment_strategy]}</Badge>
              <Badge tone={d.open_tickets ? "warning" : "neutral"}>{formatNumber(d.open_tickets)} تیکت باز</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-4 w-4" />
                <div className="flex -space-x-2 space-x-reverse">
                  {d.members.slice(0, 5).map((m) => <Avatar key={m.id} name={m.full_name} src={m.avatar_url} size="xs" className="ring-2 ring-card" />)}
                </div>
                {formatNumber(d.members.length)} نفر
              </div>
              <div className="flex">
                <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => setModal({ open: true, dept: d })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => {
                  if (await confirm({ title: `حذف دپارتمان ${d.name}`, confirmText: "حذف" }))
                    remove.mutate(d.id, { onSuccess: () => toast.success("دپارتمان حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {d.manager && <p className="mt-3 text-xs text-muted-foreground">مدیر: <span className="text-foreground">{d.manager.full_name}</span></p>}
          </Card>
        ))}
      </div>
      <DepartmentModal open={modal.open} dept={modal.dept} onClose={() => setModal({ open: false })} />
    </div>
  );
}
