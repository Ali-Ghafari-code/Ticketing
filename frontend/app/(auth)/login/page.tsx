"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLogin } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";

const schema = z.object({
  identifier: z.string().trim().min(3, "ایمیل یا شماره موبایل را وارد کنید"),
  password: z.string().min(1, "رمز عبور را وارد کنید"),
  remember_me: z.boolean(),
});
type FormValues = z.infer<typeof schema>;


export default function LoginPage() {
  const login = useLogin();
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "", remember_me: true },
  });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: (me) => toast.success(`${me.full_name} عزیز، خوش آمدید`),
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">ورود به حساب کاربری</h1>
      <p className="mt-2 text-sm text-muted-foreground">برای ادامه، ایمیل یا شماره موبایل خود را وارد کنید.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <FormField label="ایمیل یا شماره موبایل" htmlFor="identifier" error={errors.identifier?.message}>
          <Input id="identifier" autoComplete="username" icon={<UserRound className="h-4 w-4" />} className="ltr text-start" placeholder="09121234567" invalid={!!errors.identifier} {...register("identifier")} />
        </FormField>
        <FormField label="رمز عبور" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            icon={<Lock className="h-4 w-4" />}
            className="ltr text-start"
            invalid={!!errors.password}
            endSlot={
              <button type="button" onClick={() => setShow((v) => !v)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            {...register("password")}
          />
        </FormField>
        <div className="flex items-center justify-between">
          <Checkbox label="مرا به خاطر بسپار" {...register("remember_me")} />
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">فراموشی رمز عبور</Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>ورود</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        حساب کاربری ندارید؟ <Link href="/register" className="font-medium text-primary hover:underline">ثبت‌نام کنید</Link>
      </p>

    </div>
  );
}
