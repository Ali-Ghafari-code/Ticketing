"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BadgeCheck, Camera, KeyRound, Laptop, LogOut, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChangePassword, useConfirmVerification, useLogout, useRevokeSession, useSendVerification, useSessions } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth";
import { applyFieldErrors, getErrorMessage } from "@/lib/errors";
import { formatDateTime, timeAgo, toEnDigits, toFaDigits } from "@/lib/format";
import { zEmail, zMobile, zPassword } from "@/lib/validation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ThemeToggle } from "./theme";
import type { Me } from "@/types";
import { useRouter } from "next/navigation";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "نام را وارد کنید"),
  mobile: zMobile,
  email: zEmail,
  job_title: z.string().optional(),
  organization: z.string().optional(),
});

function ProfileForm({ me }: { me: Me }) {
  const setUser = useAuthStore((s) => s.setUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, setError, formState: { errors, isDirty } } = useForm<z.input<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: me.full_name, mobile: me.mobile ?? "", email: me.email ?? "", job_title: me.job_title ?? "", organization: me.organization ?? "" },
  });
  const save = useMutation({ mutationFn: async (data: Record<string, unknown>) => (await api.patch<Me>("/users/me", data)).data, onSuccess: setUser });
  const avatar = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return (await api.delete<Me>("/users/me/avatar")).data;
      const form = new FormData();
      form.append("file", file);
      return (await api.post<Me>("/users/me/avatar", form)).data;
    },
    onSuccess: (u) => { setUser(u); toast.success("تصویر پروفایل به‌روزرسانی شد"); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const onSubmit = handleSubmit((raw) => {
    const v = profileSchema.parse(raw);
    save.mutate(
      { full_name: v.full_name, mobile: v.mobile || null, email: v.email || null, job_title: v.job_title || null, organization: v.organization || null },
      { onSuccess: () => toast.success("پروفایل ذخیره شد"), onError: (e) => { applyFieldErrors(e, setError); toast.error(getErrorMessage(e)); } },
    );
  });

  return (
    <Card>
      <CardHeader title="اطلاعات حساب" />
      <CardBody>
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <Avatar name={me.full_name} src={me.avatar_url} size="xl" />
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow" aria-label="تغییر تصویر">
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.gif" onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          </div>
          <div>
            <p className="font-semibold">{me.full_name}</p>
            <p className="text-xs text-muted-foreground">{me.roles.map((r) => r.display_name).join("، ")}</p>
            {me.avatar_url && <button className="mt-1 text-xs text-danger" onClick={() => avatar.mutate(null)}>حذف تصویر</button>}
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label="نام و نام خانوادگی" error={errors.full_name?.message} className="sm:col-span-2"><Input {...register("full_name")} invalid={!!errors.full_name} /></FormField>
          <FormField label="شماره موبایل" error={errors.mobile?.message}><Input className="ltr text-start" {...register("mobile")} invalid={!!errors.mobile} /></FormField>
          <FormField label="ایمیل" error={errors.email?.message}><Input className="ltr text-start" {...register("email")} invalid={!!errors.email} /></FormField>
          {me.user_type === "customer" ? (
            <FormField label="شرکت / سازمان" className="sm:col-span-2"><Input {...register("organization")} /></FormField>
          ) : (
            <FormField label="سمت شغلی" className="sm:col-span-2"><Input {...register("job_title")} /></FormField>
          )}
          <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={!isDirty} loading={save.isPending}>ذخیره تغییرات</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}

function VerificationCard({ me }: { me: Me }) {
  const send = useSendVerification();
  const confirmCode = useConfirmVerification();
  const [channel, setChannel] = useState<"sms" | "email" | null>(null);
  const [code, setCode] = useState("");
  const rows = [
    { key: "sms" as const, label: "شماره موبایل", value: me.mobile, verified: me.mobile_verified_at },
    { key: "email" as const, label: "ایمیل", value: me.email, verified: me.email_verified_at },
  ];
  return (
    <Card>
      <CardHeader title="تایید اطلاعات تماس" description="اطلاعات تماس تایید شده برای بازیابی رمز و دریافت اعلان‌ها استفاده می‌شود." />
      <CardBody className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="text-sm ltr text-start">{r.value ? toFaDigits(r.value) : "ثبت نشده"}</p>
            </div>
            {r.value && (r.verified ? (
              <Badge tone="success"><BadgeCheck className="h-3.5 w-3.5" /> تایید شده</Badge>
            ) : (
              <Button size="sm" variant="outline" loading={send.isPending && channel === r.key} onClick={() => { setChannel(r.key); send.mutate(r.key, { onSuccess: () => toast.success("کد تایید ارسال شد"), onError: (e) => { toast.error(getErrorMessage(e)); } }); }}>
                ارسال کد تایید
              </Button>
            ))}
          </div>
        ))}
      </CardBody>
      <Modal
        open={!!channel && send.isSuccess}
        onClose={() => { setChannel(null); send.reset(); setCode(""); }}
        size="sm"
        title="وارد کردن کد تایید"
        footer={<Button loading={confirmCode.isPending} onClick={() => channel && confirmCode.mutate({ channel, code: toEnDigits(code) }, { onSuccess: () => { toast.success("تایید با موفقیت انجام شد"); setChannel(null); send.reset(); setCode(""); }, onError: (e) => toast.error(getErrorMessage(e)) })}>تایید</Button>}
      >
        <Input value={code} onChange={(e) => setCode(e.target.value)} className="ltr text-center text-lg tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus />
      </Modal>
    </Card>
  );
}

const pwdSchema = z
  .object({ current_password: z.string().min(1, "رمز عبور فعلی را وارد کنید"), new_password: zPassword, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "تکرار رمز عبور مطابقت ندارد" });

function SecurityTab() {
  const change = useChangePassword();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const logout = useLogout();
  const router = useRouter();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<z.infer<typeof pwdSchema>>({ resolver: zodResolver(pwdSchema) });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="تغییر رمز عبور" icon={<KeyRound className="h-4 w-4" />} description="پس از تغییر رمز، سایر نشست‌های فعال شما خاتمه می‌یابد." />
        <CardBody>
          <form
            className="grid max-w-xl gap-4"
            onSubmit={handleSubmit((v) => change.mutate({ current_password: v.current_password, new_password: v.new_password }, {
              onSuccess: (r) => { toast.success(r.message); reset(); sessions.refetch(); },
              onError: (e) => { applyFieldErrors(e, setError); toast.error(getErrorMessage(e)); },
            }))}
            noValidate
          >
            <FormField label="رمز عبور فعلی" error={errors.current_password?.message}><Input type="password" autoComplete="current-password" className="ltr text-start" {...register("current_password")} /></FormField>
            <FormField label="رمز عبور جدید" error={errors.new_password?.message} hint="حداقل ۸ کاراکتر شامل حروف و اعداد"><Input type="password" autoComplete="new-password" className="ltr text-start" {...register("new_password")} /></FormField>
            <FormField label="تکرار رمز عبور جدید" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" className="ltr text-start" {...register("confirm")} /></FormField>
            <div><Button type="submit" loading={change.isPending}>تغییر رمز عبور</Button></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="نشست‌های فعال"
          icon={<Laptop className="h-4 w-4" />}
          actions={<Button size="sm" variant="danger-ghost" onClick={async () => { await logout.mutateAsync(true).catch(() => undefined); router.replace("/login"); }}><LogOut className="h-4 w-4" /> خروج از همه دستگاه‌ها</Button>}
        />
        <ul className="divide-y">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Laptop className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm ltr text-start">{s.user_agent || "دستگاه نامشخص"}</p>
                <p className="text-xs text-muted-foreground">IP: <span className="ltr">{s.ip_address}</span> · آخرین فعالیت {timeAgo(s.last_used_at)} · انقضا {formatDateTime(s.expires_at)}</p>
              </div>
              {s.current ? <Badge tone="success">نشست فعلی</Badge> : (
                <Button size="icon-sm" variant="danger-ghost" aria-label="پایان نشست" onClick={() => revoke.mutate(s.id, { onSuccess: () => toast.success("نشست پایان یافت") })}><Trash2 className="h-4 w-4" /></Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="نکات امنیتی" icon={<ShieldAlert className="h-4 w-4" />} />
        <CardBody className="space-y-1 text-xs leading-6 text-muted-foreground">
          <p>• رمز عبور خود را در اختیار دیگران قرار ندهید و از رمز تکراری استفاده نکنید.</p>
          <p>• پس از چند تلاش ناموفق برای ورود، حساب شما به طور موقت قفل می‌شود.</p>
          <p>• کارکنان پشتیبانی هرگز رمز عبور یا کد تایید شما را درخواست نمی‌کنند.</p>
        </CardBody>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<"profile" | "security" | "appearance">("profile");
  if (!me) return null;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="پروفایل و امنیت" />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "profile", label: "پروفایل" }, { value: "security", label: "امنیت و نشست‌ها" }, { value: "appearance", label: "نمایش" }]} />
      {tab === "profile" && (
        <div className="space-y-6">
          <ProfileForm me={me} />
          <VerificationCard me={me} />
        </div>
      )}
      {tab === "security" && <SecurityTab />}
      {tab === "appearance" && (
        <Card>
          <CardHeader title="حالت نمایش" description="حالت روشن، تیره یا هماهنگ با تنظیمات سیستم عامل. انتخاب شما در حساب کاربری ذخیره می‌شود." />
          <CardBody><ThemeToggle className="w-full max-w-sm" /></CardBody>
        </Card>
      )}
    </div>
  );
}
