"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { customersApi, useResetUserPassword, useUserActivity, usersApi, type UserDetail as Detail } from "@/features/users/api";
import { useTickets } from "@/features/tickets/api";
import { usePermission } from "@/hooks/use-permission";
import { AUDIT_ACTION_LABELS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatDateTime, formatNumber, timeAgo, toFaDigits } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { PageLoader } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TicketTable } from "@/components/tickets/ticket-table";
import { UserFormModal } from "./user-form-modal";

function ActivityList({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const { data } = useUserActivity(userId, page);
  if (!data) return null;
  if (!data.items.length) return <EmptyState compact title="فعالیتی ثبت نشده است" />;
  return (
    <>
      <ul className="divide-y">
        {data.items.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
            <div>
              <Badge size="sm">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</Badge>
              <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
          </li>
        ))}
      </ul>
      {data.pages > 1 && <div className="border-t p-3"><Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPageChange={setPage} /></div>}
    </>
  );
}

export function UserDetailView({ id, kind }: { id: string; kind: "users" | "customers" }) {
  const isStaff = kind === "users";
  const resource = isStaff ? usersApi : customersApi;
  const { data, isLoading } = resource.useItem<Detail>(id);
  const remove = resource.useRemove();
  const reset = useResetUserPassword(kind);
  const { can } = usePermission();
  const confirm = useConfirm();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const perm = isStaff ? "users" : "customers";
  const tickets = useTickets(isStaff ? { agent: id, page_size: 10 } : { customer_id: id, page_size: 10 });

  if (isLoading) return <PageLoader />;
  if (!data) return <EmptyState title="یافت نشد" />;
  const u = data.user;

  return (
    <div>
      <nav className="mb-3 text-xs text-muted-foreground"><Link href={`/${kind}`}>{isStaff ? "کاربران" : "مشتریان"}</Link> / {u.full_name}</nav>
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center gap-5">
          <Avatar name={u.full_name} src={u.avatar_url} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{u.full_name}</h1>
              {u.is_active ? <Badge tone="success" dot>فعال</Badge> : <Badge dot>غیرفعال</Badge>}
              {u.roles.map((r) => <Badge key={r.id} tone="primary">{r.display_name}</Badge>)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{isStaff ? u.job_title : u.organization}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {u.mobile && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /><span className="ltr">{toFaDigits(u.mobile)}</span>{u.mobile_verified_at && <Badge tone="success" size="sm">تایید شده</Badge>}</span>}
              {u.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /><span className="ltr">{u.email}</span></span>}
              <span>عضویت: {formatDate(u.created_at)}</span>
              <span>آخرین ورود: {u.last_login_at ? timeAgo(u.last_login_at) : "—"}</span>
              {isStaff && u.departments.length > 0 && <span>دپارتمان: {u.departments.map((d) => d.name).join("، ")}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(`${perm}.update`) && <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> ویرایش</Button>}
            {can(`${perm}.update`) && <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}><KeyRound className="h-4 w-4" /> بازنشانی رمز</Button>}
            {can(`${perm}.delete`) && (
              <Button variant="danger-ghost" size="sm" onClick={async () => {
                if (await confirm({ title: `حذف ${u.full_name}`, confirmText: "حذف" }))
                  remove.mutate(u.id, { onSuccess: () => { toast.success("حذف شد"); router.replace(`/${kind}`); }, onError: (e) => toast.error(getErrorMessage(e)) });
              }}><Trash2 className="h-4 w-4" /> حذف</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label={isStaff ? "تیکت‌های ارجاع شده" : "کل تیکت‌ها"} value={data.stats.total} />
        <StatCard label="باز" value={data.stats.open} tone="info" />
        <StatCard label="در انتظار" value={data.stats.pending} tone="warning" />
        <StatCard label="حل شده" value={data.stats.resolved} tone="success" />
        <StatCard label="بسته شده" value={data.stats.closed} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          <h2 className="mb-3 text-sm font-semibold">{isStaff ? "تیکت‌های در دست بررسی" : "تیکت‌های مشتری"}</h2>
          <TicketTable data={tickets.data?.items} loading={tickets.isLoading} basePath="/tickets" visibleColumns={["code", "subject", "status", "priority", "sla", "updated_at"]} footer={tickets.data && tickets.data.total > 10 ? <Link className="text-xs text-primary" href={isStaff ? `/tickets?agent=${id}&view=all` : `/tickets?customer_id=${id}&view=all`}>مشاهده همه {formatNumber(tickets.data.total)} تیکت</Link> : undefined} />
        </div>
        <div className="space-y-6">
          {u.notes && <Card><CardHeader title="یادداشت داخلی" /><CardBody className="text-sm leading-7 text-muted-foreground">{u.notes}</CardBody></Card>}
          {isStaff && can("users.view") && (
            <Card>
              <CardHeader title="فعالیت‌های اخیر" />
              <ActivityList userId={id} />
            </Card>
          )}
        </div>
      </div>

      <UserFormModal kind={kind} open={edit} user={u} onClose={() => setEdit(false)} />
      <Modal
        open={resetOpen}
        onClose={() => { setResetOpen(false); setTempPassword(null); setNewPassword(""); }}
        size="sm"
        title="بازنشانی رمز عبور"
        description="تمام نشست‌های فعال کاربر خاتمه می‌یابد."
        footer={!tempPassword && <Button loading={reset.isPending} onClick={() => reset.mutate({ id, new_password: newPassword || undefined }, { onSuccess: (r) => { toast.success(r.message); if (r.temporary_password) setTempPassword(r.temporary_password); else setResetOpen(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>بازنشانی</Button>}
      >
        {tempPassword ? (
          <div className="text-center">
            <p className="text-sm">رمز عبور موقت:</p>
            <p className="mt-2 select-all rounded-lg bg-muted p-3 font-mono text-lg ltr">{tempPassword}</p>
            <p className="mt-2 text-xs text-muted-foreground">این رمز فقط یک بار نمایش داده می‌شود{u.email ? " و به ایمیل کاربر نیز ارسال شد" : ""}.</p>
          </div>
        ) : (
          <FormField label="رمز عبور جدید (اختیاری)" hint="خالی بگذارید تا رمز موقت تصادفی ساخته شود.">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="ltr text-start" />
          </FormField>
        )}
      </Modal>
    </div>
  );
}
