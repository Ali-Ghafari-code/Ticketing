import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-black text-primary/30">۴۰۴</p>
      <h1 className="text-xl font-bold">صفحه مورد نظر یافت نشد</h1>
      <p className="text-sm text-muted-foreground">ممکن است آدرس اشتباه باشد یا صفحه حذف شده باشد.</p>
      <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">بازگشت به صفحه اصلی</Link>
    </div>
  );
}
