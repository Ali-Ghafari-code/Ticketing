"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Hourglass, Inbox, Lock, Plus, Search } from "lucide-react";
import { useTicketStats, useTickets } from "@/features/tickets/api";
import { useArticles } from "@/features/kb/api";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { PriorityBadge, TicketStatusBadge } from "@/components/tickets/badges";
import { timeAgo } from "@/lib/format";

export default function PortalHome() {
  const user = useAuthStore((s) => s.user);
  const stats = useTicketStats();
  const recent = useTickets({ page: 1, page_size: 5, sort: "updated_at", direction: "desc" });
  const articles = useArticles({ sort: "popular", page_size: 5 });
  const [q, setQ] = useState("");
  const router = useRouter();

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-6 sm:p-8">
        <h1 className="text-xl font-bold sm:text-2xl">سلام {user?.full_name}، چطور می‌توانیم کمک کنیم؟</h1>
        <p className="mt-2 text-sm text-muted-foreground">قبل از ثبت تیکت، پاسخ سوال خود را در پایگاه دانش جستجو کنید.</p>
        <form
          className="mt-5 flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/portal/kb?q=${encodeURIComponent(q)}`);
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً: بازیابی رمز عبور" icon={<Search className="h-4 w-4" />} className="h-11 bg-card" />
          <Button type="submit" size="lg">جستجو</Button>
        </form>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="کل تیکت‌ها" value={stats.data?.total} loading={stats.isLoading} icon={<Inbox className="h-4 w-4" />} tone="primary" href="/portal/tickets" />
        <StatCard label="باز" value={stats.data?.open} loading={stats.isLoading} icon={<Clock className="h-4 w-4" />} tone="info" href="/portal/tickets?view=open" />
        <StatCard label="در انتظار پاسخ شما" value={stats.data?.pending} loading={stats.isLoading} icon={<Hourglass className="h-4 w-4" />} tone="warning" href="/portal/tickets?view=pending" />
        <StatCard label="حل شده" value={stats.data?.resolved} loading={stats.isLoading} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" href="/portal/tickets?view=resolved" />
        <StatCard label="بسته شده" value={stats.data?.closed} loading={stats.isLoading} icon={<Lock className="h-4 w-4" />} href="/portal/tickets?view=closed" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="آخرین تیکت‌ها" actions={<Link href="/portal/tickets" className="inline-flex items-center gap-1 text-xs text-primary">همه تیکت‌ها <ArrowLeft className="h-3.5 w-3.5" /></Link>} />
          {recent.isLoading ? (
            <div className="p-5"><SkeletonRows rows={3} /></div>
          ) : recent.data?.items.length ? (
            <ul className="divide-y">
              {recent.data.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/portal/tickets/${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${t.unread ? "font-bold" : "font-medium"}`}>{t.subject}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="font-mono ltr">{t.code}</span> · {timeAgo(t.updated_at)}</p>
                    </div>
                    <PriorityBadge priority={t.priority} size="sm" />
                    <TicketStatusBadge status={t.status} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="هنوز تیکتی ثبت نکرده‌اید" description="در صورت بروز مشکل، تیم پشتیبانی آماده کمک به شماست." action={<Link href="/portal/tickets/new"><Button><Plus className="h-4 w-4" /> ثبت اولین تیکت</Button></Link>} />
          )}
        </Card>
        <Card>
          <CardHeader title="مقالات پربازدید" icon={<BookOpen className="h-4 w-4" />} />
          <ul className="divide-y">
            {articles.data?.items.map((a) => (
              <li key={a.id}>
                <Link href={`/portal/kb/${a.slug}`} className="block px-5 py-3 text-sm hover:bg-muted/40">
                  {a.title}
                  {a.summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{a.summary}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
