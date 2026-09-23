"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">خطای غیرمنتظره</h1>
      <p className="text-sm text-muted-foreground">متأسفانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.</p>
      <button onClick={reset} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">تلاش مجدد</button>
    </div>
  );
}
