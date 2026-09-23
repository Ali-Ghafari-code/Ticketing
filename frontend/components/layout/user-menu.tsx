"use client";
import { useRouter } from "next/navigation";
import { LogOut, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLogout } from "@/features/auth/api";
import { useAuthStore } from "@/store/auth";
import { Avatar } from "@/components/ui/avatar";
import { Popover } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/common/theme";
import Link from "next/link";

export function UserMenu({ profileHref = "/profile", settingsHref }: { profileHref?: string; settingsHref?: string }) {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const router = useRouter();
  if (!user) return null;
  const roles = user.roles.map((r) => r.display_name).join("، ");
  return (
    <Popover
      align="end"
      panelClassName="w-72 p-0"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted" aria-label="منوی کاربر">
          <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
          <span className="hidden max-w-[9rem] truncate text-sm font-medium md:block">{user.full_name}</span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-3 border-b p-4">
            <Avatar name={user.full_name} src={user.avatar_url} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{roles || user.email || user.mobile}</p>
            </div>
          </div>
          <div className="p-1">
            <Link href={profileHref} onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
              <UserRound className="h-4 w-4" /> پروفایل و امنیت
            </Link>
            {settingsHref && (
              <Link href={settingsHref} onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <Settings2 className="h-4 w-4" /> تنظیمات اعلان‌ها
              </Link>
            )}
          </div>
          <div className="border-t p-3">
            <p className="mb-2 text-xs text-muted-foreground">حالت نمایش</p>
            <ThemeToggle className="w-full" />
          </div>
          <div className="border-t p-1">
            <button
              onClick={async () => {
                close();
                await logout.mutateAsync(false).catch(() => undefined);
                toast.success("با موفقیت خارج شدید.");
                router.replace("/login");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" /> خروج از حساب
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
