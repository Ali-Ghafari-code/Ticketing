"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useMarkAllRead, useMarkNotificationRead, useNotifications, useUnreadCount } from "@/features/notifications/api";
import { Popover } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo, toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationDropdown({ allHref = "/notifications" }: { allHref?: string }) {
  const router = useRouter();
  const { data: unread = 0 } = useUnreadCount();
  const list = useNotifications({ page: 1, page_size: 8 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  return (
    <Popover
      align="end"
      panelClassName="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0"
      trigger={({ toggle }) => (
        <button
          onClick={() => {
            toggle();
            list.refetch();
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={unread ? `اعلان‌ها (${unread} خوانده نشده)` : "اعلان‌ها"}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
              {unread > 99 ? "۹۹+" : toFaDigits(unread)}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">اعلان‌ها</p>
            <button
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              خواندن همه
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.isLoading && (
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {list.data?.items.length === 0 && <p className="px-4 py-10 text-center text-xs text-muted-foreground">اعلانی ندارید</p>}
            {list.data?.items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id);
                  close();
                  if (n.link) router.push(n.link);
                }}
                className={cn("flex w-full gap-3 border-b px-4 py-3 text-start last:border-0 hover:bg-muted/50", !n.read_at && "bg-primary/[0.04]")}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-6">{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs leading-5 text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link href={allHref} onClick={close} className="block border-t py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/50">
            مشاهده همه اعلان‌ها
          </Link>
        </div>
      )}
    </Popover>
  );
}
