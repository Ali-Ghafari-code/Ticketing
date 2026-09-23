"use client";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { rolesApi, usePermissions } from "@/features/users/api";
import { usePermission } from "@/hooks/use-permission";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Role } from "@/types";

const GROUP_LABELS: Record<string, string> = {
  tickets: "تیکت‌ها", users: "کاربران", customers: "مشتریان", organization: "ساختار سازمان", reports: "گزارش‌ها",
  content: "محتوا", settings: "تنظیمات", platform: "سطح سامانه",
};

export default function RolesPage() {
  const roles = rolesApi.useList<Role[]>();
  const perms = usePermissions();
  const update = rolesApi.useUpdate();
  const create = rolesApi.useCreate();
  const remove = rolesApi.useRemove();
  const confirm = useConfirm();
  const { isSuperAdmin } = usePermission();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", display_name: "", audience: "staff" });
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  const editable = selected && (selected.company_id !== null || isSuperAdmin) && selected.name !== "super_admin";

  useEffect(() => {
    if (selected) setCodes(selected.permissions.map((p) => p.code));
  }, [selected]);

  const permList = perms.data;
  const groups = useMemo(() => {
    const out: Record<string, NonNullable<typeof permList>> = {};
    (permList ?? []).forEach((p) => (out[p.group] ||= []).push(p));
    return out;
  }, [permList]);

  if (roles.isLoading || perms.isLoading) return <PageLoader />;
  const dirty = selected && JSON.stringify([...codes].sort()) !== JSON.stringify(selected.permissions.map((p) => p.code).sort());

  return (
    <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader title="نقش‌ها" actions={<Button size="icon-sm" variant="ghost" onClick={() => setNewOpen(true)} aria-label="نقش جدید"><Plus className="h-4 w-4" /></Button>} />
        <ul className="p-2">
          {roles.data?.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSelectedId(r.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm", selected?.id === r.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                <span className="flex items-center gap-2">{r.is_system && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}{r.display_name}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(r.users_count)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected && (
        <Card>
          <CardHeader
            title={selected.display_name}
            icon={<KeyRound className="h-4 w-4" />}
            description={selected.description ?? (selected.is_system ? "نقش پیش‌فرض سامانه" : "نقش سفارشی سازمان")}
            actions={
              <>
                {!selected.is_system && editable && (
                  <Button size="sm" variant="danger-ghost" onClick={async () => {
                    if (await confirm({ title: `حذف نقش ${selected.display_name}` })) remove.mutate(selected.id, { onSuccess: () => { toast.success("نقش حذف شد"); setSelectedId(null); }, onError: (e) => toast.error(getErrorMessage(e)) });
                  }}><Trash2 className="h-4 w-4" /> حذف</Button>
                )}
                {editable && <Button size="sm" disabled={!dirty} loading={update.isPending} onClick={() => update.mutate({ id: selected.id, data: { permission_codes: codes } }, { onSuccess: () => toast.success("مجوزها ذخیره شد"), onError: (e) => toast.error(getErrorMessage(e)) })}>ذخیره مجوزها</Button>}
              </>
            }
          />
          <CardBody className="space-y-6">
            {!editable && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">نقش‌های پیش‌فرض سامانه فقط توسط مدیر کل قابل ویرایش هستند. برای سفارشی‌سازی، یک نقش جدید بسازید.</p>}
            {Object.entries(groups).map(([group, list]) => (
              <div key={group}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{GROUP_LABELS[group] ?? group}</h4>
                  {editable && (
                    <button className="text-xs text-primary" onClick={() => {
                      const all = list.every((p) => codes.includes(p.code));
                      setCodes(all ? codes.filter((c) => !list.some((p) => p.code === c)) : Array.from(new Set([...codes, ...list.map((p) => p.code)])));
                    }}>انتخاب/لغو همه</button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => (
                    <div key={p.code} className="rounded-lg border px-3 py-2">
                      <Checkbox
                        disabled={!editable}
                        checked={codes.includes(p.code)}
                        onChange={(e) => setCodes(e.target.checked ? [...codes, p.code] : codes.filter((c) => c !== p.code))}
                        label={p.name}
                        description={<span className="font-mono ltr">{p.code}</span>}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Badge tone="primary">{formatNumber(codes.length)} مجوز انتخاب شده</Badge>
          </CardBody>
        </Card>
      )}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} size="sm" title="نقش جدید" footer={
        <Button loading={create.isPending} onClick={() => create.mutate({ ...newRole, permission_codes: [] }, { onSuccess: (r) => { toast.success("نقش ایجاد شد؛ اکنون مجوزها را تعیین کنید."); setNewOpen(false); setSelectedId(r.id); setNewRole({ name: "", display_name: "", audience: "staff" }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>ایجاد</Button>
      }>
        <div className="space-y-4">
          <FormField label="عنوان نقش"><Input value={newRole.display_name} onChange={(e) => setNewRole({ ...newRole, display_name: e.target.value })} placeholder="مثلاً: کارشناس ارشد" /></FormField>
          <FormField label="شناسه (انگلیسی)" hint="فقط حروف کوچک انگلیسی، عدد و _"><Input className="ltr" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="senior_agent" /></FormField>
          <FormField label="نوع کاربران"><Select value={newRole.audience} onChange={(e) => setNewRole({ ...newRole, audience: e.target.value })} options={[{ value: "staff", label: "کارکنان" }, { value: "customer", label: "مشتریان" }]} /></FormField>
        </div>
      </Modal>
    </div>
  );
}
