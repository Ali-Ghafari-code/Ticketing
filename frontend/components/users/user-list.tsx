"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { customersApi, rolesApi, usersApi } from "@/features/users/api";
import { usePermission } from "@/hooks/use-permission";
import { useDebounce } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber, timeAgo, toFaDigits } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ExportMenu } from "@/components/common/export-menu";
import type { Page, Role, User } from "@/types";
import { UserFormModal } from "./user-form-modal";

function Inner({ kind }: { kind: "users" | "customers" }) {
  const isStaff = kind === "users";
  const resource = isStaff ? usersApi : customersApi;
  const perm = isStaff ? "users" : "customers";
  const { can } = usePermission();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [active, setActive] = useState("");
  const [roleId, setRoleId] = useState("");
  const [modal, setModal] = useState<{ open: boolean; user?: User | null }>({ open: params.get("new") === "1" });
  const debounced = useDebounce(q, 350);
  const list = resource.useList<Page<User>>({ q: debounced || undefined, page, page_size: pageSize, is_active: active || undefined, role_id: roleId || undefined });
  const roles = rolesApi.useList<Role[]>({ audience: "staff" }, { enabled: isStaff });
  const update = resource.useUpdate();
  const remove = resource.useRemove();
  const confirm = useConfirm();
  useEffect(() => setPage(1), [debounced, active, roleId]);

  const base = `/${kind}`;
  const columns: Column<User>[] = [
    {
      id: "name",
      header: "نام",
      hideable: false,
      cell: (u) => (
        <Link href={`${base}/${u.id}`} className="flex items-center gap-3">
          <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium hover:text-primary">{u.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{isStaff ? u.job_title : u.organization}</p>
          </div>
        </Link>
      ),
    },
    { id: "contact", header: "اطلاعات تماس", cell: (u) => <div className="text-xs ltr text-start"><p>{u.mobile ? toFaDigits(u.mobile) : "—"}</p><p className="text-muted-foreground">{u.email}</p></div> },
    ...(isStaff
      ? [
          { id: "roles", header: "نقش", cell: (u: User) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.id} tone="primary" size="sm">{r.display_name}</Badge>)}</div> },
          { id: "departments", header: "دپارتمان", cell: (u: User) => <span className="text-xs">{u.departments.map((d) => d.name).join("، ") || "—"}</span> },
        ]
      : [{ id: "tickets", header: "تیکت‌ها", cell: (u: User) => <Link href={`/tickets?customer_id=${u.id}&view=all`} className="text-xs text-primary">{formatNumber(u.tickets_count ?? 0)} تیکت</Link> }]),
    { id: "status", header: "وضعیت", cell: (u) => (u.is_active ? <Badge tone="success" dot>فعال</Badge> : <Badge tone="neutral" dot>غیرفعال</Badge>) },
    { id: "last_login", header: "آخرین ورود", cell: (u) => <span className="text-xs text-muted-foreground">{u.last_login_at ? timeAgo(u.last_login_at) : "—"}</span> },
    {
      id: "actions",
      header: "",
      hideable: false,
      className: "w-10",
      cell: (u) => (
        <Dropdown
          trigger={<Button size="icon-sm" variant="ghost" aria-label="عملیات"><MoreHorizontal className="h-4 w-4" /></Button>}
          items={[
            { label: "ویرایش", icon: <Pencil className="h-4 w-4" />, onClick: () => setModal({ open: true, user: u }), hidden: !can(`${perm}.update`) },
            {
              label: u.is_active ? "غیرفعال کردن" : "فعال کردن",
              icon: u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
              hidden: !can(`${perm}.update`),
              onClick: () => update.mutate({ id: u.id, data: { is_active: !u.is_active } }, { onSuccess: () => toast.success("وضعیت حساب تغییر کرد"), onError: (e) => toast.error(getErrorMessage(e)) }),
            },
            {
              label: "حذف",
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              hidden: !can(`${perm}.delete`),
              onClick: async () => {
                if (await confirm({ title: `حذف ${u.full_name}`, description: "حساب کاربری غیرفعال و اطلاعات تماس آزاد می‌شود. سوابق تیکت‌ها حفظ خواهد شد.", confirmText: "حذف" }))
                  remove.mutate(u.id, { onSuccess: () => toast.success("حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={isStaff ? "کاربران و کارشناسان" : "مشتریان"}
        description={list.data ? `${formatNumber(list.data.total)} ${isStaff ? "کاربر" : "مشتری"}` : undefined}
        actions={
          <>
            {can(`${perm}.view`, "reports.export") && <ExportMenu url={`/${kind}/export`} filename={kind} />}
            {can(`${perm}.create`) && <Button onClick={() => setModal({ open: true, user: null })}><Plus className="h-4 w-4" /> {isStaff ? "کاربر جدید" : "مشتری جدید"}</Button>}
          </>
        }
      />
      <DataTable
        columns={columns}
        data={list.data?.items}
        loading={list.isLoading}
        getRowId={(u) => u.id}
        rowHref={(u) => `${base}/${u.id}`}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[12rem] flex-1"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، موبایل، ایمیل..." icon={<Search className="h-4 w-4" />} className="h-9" /></div>
            <Select size="sm" className="h-9 w-36" value={active} onChange={(e) => setActive(e.target.value)} placeholder="همه وضعیت‌ها" options={[{ value: "true", label: "فعال" }, { value: "false", label: "غیرفعال" }]} />
            {isStaff && <Select size="sm" className="h-9 w-44" value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="همه نقش‌ها" options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.display_name }))} />}
          </div>
        }
        mobileCard={(u) => (
          <Link href={`${base}/${u.id}`} className="flex items-center gap-3">
            <Avatar name={u.full_name} src={u.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.full_name}</p>
              <p className="truncate text-xs text-muted-foreground ltr text-start">{u.mobile ? toFaDigits(u.mobile) : u.email}</p>
            </div>
            {u.is_active ? <Badge tone="success" size="sm">فعال</Badge> : <Badge size="sm">غیرفعال</Badge>}
          </Link>
        )}
        footer={list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={list.data.page_size} onPageChange={setPage} onPageSizeChange={setPageSize} />}
      />
      <UserFormModal kind={kind} open={modal.open} user={modal.user} onClose={() => setModal({ open: false })} />
    </div>
  );
}

export function UserList({ kind }: { kind: "users" | "customers" }) {
  return <Suspense><Inner kind={kind} /></Suspense>;
}
