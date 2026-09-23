import { LifeBuoy, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { AuthLayoutGuard } from "./guard";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayoutGuard>
      <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,34rem)]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-indigo-900 p-12 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><LifeBuoy className="h-5 w-5" /></span>
            <span className="text-lg font-bold">سامانه پشتیبانی</span>
          </div>
          <div className="my-auto max-w-md">
            <h2 className="text-3xl font-bold leading-[1.6]">پشتیبانی حرفه‌ای، مشتریان راضی‌تر</h2>
            <p className="mt-4 text-sm leading-7 text-white/80">
              همه درخواست‌های مشتریان را در یک جا مدیریت کنید؛ با ارجاع خودکار، پایش SLA، پایگاه دانش و گزارش‌های دقیق.
            </p>
            <ul className="mt-8 space-y-4 text-sm">
              <li className="flex items-center gap-3"><Timer className="h-5 w-5 text-white/80" /> پایش لحظه‌ای مهلت پاسخگویی (SLA)</li>
              <li className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-white/80" /> ارجاع هوشمند تیکت به کارشناسان</li>
              <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-white/80" /> امنیت سازمانی و تفکیک کامل داده‌ها</li>
            </ul>
          </div>
          <p className="text-xs text-white/60">© سامانه پشتیبانی و تیکتینگ</p>
          <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        </aside>
        <main className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </AuthLayoutGuard>
  );
}
