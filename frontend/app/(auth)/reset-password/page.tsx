"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useResetPassword } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { toEnDigits, toFaDigits } from "@/lib/format";
import { zPassword } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

const schema = z
  .object({ code: z.string().optional(), password: zPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "تکرار رمز عبور مطابقت ندارد", path: ["confirm"] });
type FormValues = z.infer<typeof schema>;

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const mobile = params.get("mobile");
  const reset = useResetPassword();
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token && !mobile) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold">لینک نامعتبر است</h1>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm text-primary">درخواست مجدد بازیابی</Link>
      </div>
    );
  }

  const onSubmit = handleSubmit((v) => {
    if (!token && !(v.code && v.code.length >= 4)) return setError("code", { message: "کد تایید را وارد کنید" });
    reset.mutate(
      token ? { token, new_password: v.password } : { identifier: mobile!, code: toEnDigits(v.code ?? ""), new_password: v.password },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          router.replace("/login");
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">تعیین رمز عبور جدید</h1>
      {mobile && <p className="mt-2 text-sm text-muted-foreground">کد ارسال شده به <span className="ltr inline-block">{toFaDigits(mobile)}</span> را وارد کنید.</p>}
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {!token && (
          <FormField label="کد تایید" error={errors.code?.message}>
            <Input inputMode="numeric" autoComplete="one-time-code" className="ltr text-center tracking-[0.5em]" maxLength={8} invalid={!!errors.code} {...register("code")} />
          </FormField>
        )}
        <FormField label="رمز عبور جدید" error={errors.password?.message} hint="حداقل ۸ کاراکتر شامل حروف و اعداد">
          <Input type="password" autoComplete="new-password" className="ltr text-start" invalid={!!errors.password} {...register("password")} />
        </FormField>
        <FormField label="تکرار رمز عبور" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" className="ltr text-start" invalid={!!errors.confirm} {...register("confirm")} />
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={reset.isPending}>ذخیره رمز عبور</Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
