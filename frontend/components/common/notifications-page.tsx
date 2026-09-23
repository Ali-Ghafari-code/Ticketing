"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCheck, Mail, MessageSquareText, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteNotification,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotificationSettings,
  useNotifications,
  useUpdateNotificationSettings,
} from "@/features/notifications/api";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import type { NotificationSetting } from "@/types";

function NotificationList() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useNotifications({ page, page_size: 20, unread_only: unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  const remove = useDeleteNotification();
  const router = useRouter();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <Tabs variant="pill" value={unreadOnly ? "unread" : "all"} onChange={(v) => { setUnreadOnly(v === "unread"); setPage(1); }} items={[{ value: "all", label: "همه" }, { value: "unread", label: "خوانده نشده", count: data?.unread }]} />
        <Button size="sm" variant="ghost" disabled={!data?.unread} loading={markAll.isPending} onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4" /> علامت‌گذاری همه به عنوان خوانده شده</Button>
      </div>
      {isLoading && <div className="p-5"><SkeletonRows rows={5} /></div>}
      {data?.items.length === 0 && <EmptyState icon={<Bell className="h-6 w-6" />} title="اعلانی وجود ندارد" />}
      <ul className="divide-y">
        {data?.items.map((n) => (
          <li key={n.id} className={cn("group flex gap-3 px-4 py-3.5", !n.read_at && "bg-primary/[0.03]")}>
            <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-muted" : "bg-primary")} aria-label={n.read_at ? "خوانده شده" : "خوانده نشده"} />
            <button
              className="min-w-0 flex-1 text-start"
              onClick={() => {
                if (!n.read_at) markRead.mutate(n.id);
                if (n.link) router.push(n.link);
              }}
            >
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs leading-6 text-muted-foreground">{n.body}</p>}
              <time className="text-[0.7rem] text-muted-foreground" title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</time>
            </button>
            <button className="self-start rounded p-1.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100" onClick={() => remove.mutate(n.id)} aria-label="حذف اعلان">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {data && data.pages > 1 && <div className="border-t p-3"><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPageChange={setPage} /></div>}
    </Card>
  );
}

export function NotificationSettingsForm() {
  const { data, isLoading } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [draft, setDraft] = useState<NotificationSetting[] | null>(null);
  const items = draft ?? data ?? [];
  const set = (event: string, key: "in_app" | "email" | "sms", value: boolean) =>
    setDraft(items.map((i) => (i.event === event ? { ...i, [key]: value } : i)));

  if (isLoading) return <SkeletonRows rows={5} />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">رویداد</th>
              <th className="px-3 py-3 font-medium"><span className="inline-flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" /> درون‌برنامه</span></th>
              <th className="px-3 py-3 font-medium"><span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> ایمیل</span></th>
              <th className="px-3 py-3 font-medium"><span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> پیامک</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.event} className="border-b last:border-0">
                <td className="px-4 py-3">{i.label}</td>
                {(["in_app", "email", "sms"] as const).map((k) => (
                  <td key={k} className="px-3 py-3 text-center"><Switch checked={i[k]} onChange={(v) => set(i.event, k, v)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t p-3">
        <Button
          disabled={!draft}
          loading={update.isPending}
          onClick={() => update.mutate(items, { onSuccess: () => { setDraft(null); toast.success("تنظیمات اعلان ذخیره شد"); }, onError: (e) => toast.error(getErrorMessage(e)) })}
        >
          ذخیره تنظیمات
        </Button>
      </div>
    </Card>
  );
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "settings" ? "settings" : "list";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="اعلان‌ها" description="اعلان‌های دریافتی و تنظیمات کانال‌های اطلاع‌رسانی" />
      <Tabs className="mb-4" value={tab} onChange={(v) => router.replace(v === "settings" ? "?tab=settings" : "?")} items={[{ value: "list", label: "اعلان‌ها" }, { value: "settings", label: "تنظیمات اعلان‌ها" }]} />
      {tab === "list" ? <NotificationList /> : <NotificationSettingsForm />}
    </div>
  );
}

export function NotificationsPage() {
  return <Suspense><Inner /></Suspense>;
}
