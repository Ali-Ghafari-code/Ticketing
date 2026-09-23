"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useForgotPassword } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/errors";
import { toEnDigits } from "@/lib/format";
import { normalizeMobile } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const forgot = useForgotPassword();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = identifier.includes("@") ? identifier.trim().toLowerCase() : normalizeMobile(toEnDigits(identifier));
    if (value.length < 5) return toast.error("ایمیل یا شماره موبایل را وارد کنید.");
    forgot.mutate(value, {
      onSuccess: (res) => {
        if (res.channel === "sms") router.push(`/reset-password?mobile=${encodeURIComponent(value)}`);
        else setSent(res.message);
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    });
  };

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success"><MailCheck className="h-7 w-7" /></span>
        <h1 className="mt-4 text-xl font-bold">ایمیل بازیابی ارسال شد</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{sent}</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary">بازگشت به صفحه ورود</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> بازگشت</Link>
      <h1 className="text-2xl font-bold">بازیابی رمز عبور</h1>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">
        اگر شماره موبایل وارد کنید، کد تایید پیامک می‌شود؛ در صورت وارد کردن ایمیل، لینک بازیابی برای شما ارسال خواهد شد.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <FormField label="ایمیل یا شماره موبایل">
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="ltr text-start" autoFocus />
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={forgot.isPending}>ارسال</Button>
      </form>
    </div>
  );
}
