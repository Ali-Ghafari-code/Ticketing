"use client";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { customersApi, rolesApi, usersApi } from "@/features/users/api";
import { departmentsApi } from "@/features/config/api";
import { applyFieldErrors, getErrorMessage } from "@/lib/errors";
import { zEmail, zMobile } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import type { Department, Role, User } from "@/types";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "نام را وارد کنید"),
    mobile: zMobile,
    email: zEmail,
    password: z.string().optional(),
    job_title: z.string().optional(),
    organization: z.string().optional(),
    notes: z.string().optional(),
    role_ids: z.array(z.string()),
    department_ids: z.array(z.string()),
    is_active: z.boolean(),
  })
  .refine((v) => v.mobile || v.email, { path: ["mobile"], message: "وارد کردن موبایل یا ایمیل الزامی است" })
  .refine((v) => !v.password || (v.password.length >= 8 && /\d/.test(v.password) && /\p{L}/u.test(v.password)), {
    path: ["password"],
    message: "رمز عبور باید حداقل ۸ کاراکتر و شامل حروف و اعداد باشد",
  });
type FormValues = z.input<typeof schema>;

interface Props {
  kind: "users" | "customers";
  open: boolean;
  onClose: () => void;
  user?: User | null;
}

export function UserFormModal({ kind, open, onClose, user }: Props) {
  const isStaff = kind === "users";
  const resource = isStaff ? usersApi : customersApi;
  const create = resource.useCreate();
  const update = resource.useUpdate();
  const roles = rolesApi.useList<Role[]>({ audience: isStaff ? "staff" : "customer" }, { enabled: open && isStaff });
  const departments = departmentsApi.useList<Department[]>(undefined, { enabled: open && isStaff });

  const { register, handleSubmit, reset, control, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      full_name: user?.full_name ?? "",
      mobile: user?.mobile ?? "",
      email: user?.email ?? "",
      password: "",
      job_title: user?.job_title ?? "",
      organization: user?.organization ?? "",
      notes: user?.notes ?? "",
      role_ids: user?.roles.map((r) => r.id) ?? [],
      department_ids: user?.departments.map((d) => d.id) ?? [],
      is_active: user?.is_active ?? true,
    });
  }, [open, user, reset]);

  const onSubmit = handleSubmit((raw) => {
    const v = schema.parse(raw);
    const payload = {
      full_name: v.full_name,
      mobile: v.mobile || null,
      email: v.email || null,
      job_title: v.job_title || null,
      organization: v.organization || null,
      notes: v.notes || null,
      is_active: v.is_active,
      ...(isStaff ? { role_ids: v.role_ids, department_ids: v.department_ids } : {}),
      ...(!user && v.password ? { password: v.password } : {}),
    };
    const opts = {
      onSuccess: () => {
        toast.success(user ? "اطلاعات ذخیره شد" : isStaff ? "کاربر ایجاد شد" : "مشتری ایجاد شد");
        onClose();
      },
      onError: (e: unknown) => {
        applyFieldErrors(e, setError);
        toast.error(getErrorMessage(e));
      },
    };
    if (user) update.mutate({ id: user.id, data: payload }, opts);
    else create.mutate(payload, opts);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={user ? `ویرایش ${user.full_name}` : isStaff ? "کاربر جدید" : "مشتری جدید"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={onSubmit} loading={create.isPending || update.isPending}>{user ? "ذخیره" : "ایجاد"}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="نام و نام خانوادگی" required error={errors.full_name?.message} className="sm:col-span-2"><Input {...register("full_name")} invalid={!!errors.full_name} /></FormField>
        <FormField label="موبایل" error={errors.mobile?.message}><Input className="ltr text-start" placeholder="09121234567" {...register("mobile")} invalid={!!errors.mobile} /></FormField>
        <FormField label="ایمیل" error={errors.email?.message}><Input className="ltr text-start" {...register("email")} invalid={!!errors.email} /></FormField>
        {isStaff ? (
          <FormField label="سمت" className="sm:col-span-2"><Input {...register("job_title")} /></FormField>
        ) : (
          <FormField label="شرکت / سازمان" className="sm:col-span-2"><Input {...register("organization")} /></FormField>
        )}
        {!user && (
          <FormField label="رمز عبور" error={errors.password?.message} hint="خالی بگذارید تا رمز موقت ساخته و به ایمیل کاربر ارسال شود." className="sm:col-span-2">
            <Input type="password" autoComplete="new-password" className="ltr text-start" {...register("password")} invalid={!!errors.password} />
          </FormField>
        )}
        {isStaff && (
          <>
            <FormField label="نقش‌ها" className="sm:col-span-2" hint="در صورت انتخاب نکردن، نقش «کارشناس پشتیبانی» تخصیص داده می‌شود.">
              <Controller
                control={control}
                name="role_ids"
                render={({ field }) => (
                  <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                    {roles.data?.map((r) => (
                      <Checkbox
                        key={r.id}
                        label={r.display_name}
                        description={r.is_system ? "نقش سیستمی" : "نقش سفارشی"}
                        checked={field.value?.includes(r.id)}
                        onChange={(e) => field.onChange(e.target.checked ? [...(field.value ?? []), r.id] : field.value?.filter((x) => x !== r.id))}
                      />
                    ))}
                  </div>
                )}
              />
            </FormField>
            <FormField label="دپارتمان‌ها" className="sm:col-span-2">
              <Controller
                control={control}
                name="department_ids"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5">
                    {departments.data?.map((d) => {
                      const on = field.value?.includes(d.id);
                      return (
                        <button key={d.id} type="button" aria-pressed={on} onClick={() => field.onChange(on ? field.value?.filter((x) => x !== d.id) : [...(field.value ?? []), d.id])} className={`rounded-md border px-2.5 py-1 text-xs ${on ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </FormField>
          </>
        )}
        <FormField label="یادداشت داخلی" className="sm:col-span-2"><Textarea {...register("notes")} className="min-h-[70px]" /></FormField>
        <Controller control={control} name="is_active" render={({ field }) => <Switch className="sm:col-span-2" checked={field.value} onChange={field.onChange} label="حساب فعال" description="کاربران غیرفعال امکان ورود ندارند." />} />
      </form>
    </Modal>
  );
}
