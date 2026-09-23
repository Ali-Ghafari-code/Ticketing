"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { usePublicCompany, useRegister } from "@/features/auth/api";
import { applyFieldErrors, getErrorMessage } from "@/lib/errors";
import { zEmail, zMobile, zPassword } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Spinner } from "@/components/ui/spinner";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "نام و نام خانوادگی را وارد کنید"),
    mobile: zMobile,
    email: zEmail,
    organization: z.string().trim().optional(),
    password: zPassword,
    confirm: z.string(),
  })
  .refine((v) => v.mobile || v.email, { message: "وارد کردن موبایل یا ایمیل الزامی است", path: ["mobile"] })
  .refine((v) => v.password === v.confirm, { message: "تکرار رمز عبور مطابقت ندارد", path: ["confirm"] });
type FormValues = z.input<typeof schema>;

function RegisterForm() {
  const params = useSearchParams();
  const slug = params.get("company") || process.env.NEXT_PUBLIC_DEFAULT_COMPANY || "demo";
  const company = usePublicCompany(slug);
  const registerMutation = useRegister();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((raw) => {
    const values = schema.parse(raw);
    registerMutation.mutate(
      {
        company_slug: slug,
        full_name: values.full_name,
        mobile: values.mobile || undefined,
        email: values.email || undefined,
        organization: values.organization || undefined,
        password: values.password,
      },
      {
        onSuccess: () => toast.success("حساب کاربری شما با موفقیت ایجاد شد."),
        onError: (e) => {
          applyFieldErrors(e, setError);
          toast.error(getErrorMessage(e));
        },
      },
    );
  });

  if (company.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (company.isError || !company.data) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold">سازمان یافت نشد</h1>
        <p className="mt-2 text-sm text-muted-foreground">لینک ثبت‌نام معتبر نیست. لطفاً از لینک ارائه شده توسط پشتیبانی استفاده کنید.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary">بازگشت به صفحه ورود</Link>
      </div>
    );
  }
  if (!company.data.allow_registration) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold">ثبت‌نام غیرفعال است</h1>
        <p className="mt-2 text-sm text-muted-foreground">برای دریافت حساب کاربری با پشتیبانی {company.data.name} تماس بگیرید.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary">بازگشت به صفحه ورود</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">ایجاد حساب کاربری</h1>
      <p className="mt-2 text-sm text-muted-foreground">ثبت‌نام در مرکز پشتیبانی <strong className="text-foreground">{company.data.name}</strong></p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <FormField label="نام و نام خانوادگی" required error={errors.full_name?.message}>
          <Input autoComplete="name" invalid={!!errors.full_name} {...register("full_name")} />
        </FormField>
        <FormField label="شماره موبایل" error={errors.mobile?.message} hint="برای دریافت پیامک وضعیت تیکت‌ها">
          <Input inputMode="tel" autoComplete="tel" className="ltr text-start" placeholder="09121234567" invalid={!!errors.mobile} {...register("mobile")} />
        </FormField>
        <FormField label="ایمیل" error={errors.email?.message}>
          <Input type="email" autoComplete="email" className="ltr text-start" invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField label="نام شرکت / سازمان (اختیاری)">
          <Input {...register("organization")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="رمز عبور" required error={errors.password?.message}>
            <Input type="password" autoComplete="new-password" className="ltr text-start" invalid={!!errors.password} {...register("password")} />
          </FormField>
          <FormField label="تکرار رمز عبور" required error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" className="ltr text-start" invalid={!!errors.confirm} {...register("confirm")} />
          </FormField>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={registerMutation.isPending}>ثبت‌نام</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        حساب کاربری دارید؟ <Link href="/login" className="font-medium text-primary hover:underline">وارد شوید</Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
