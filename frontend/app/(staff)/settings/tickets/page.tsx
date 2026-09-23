"use client";
import { useState } from "react";
import { Lock, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { prioritiesApi, statusesApi, tagsApi } from "@/features/config/api";
import { getErrorMessage } from "@/lib/errors";
import { STATE_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Tag, TicketPriority, TicketStatus } from "@/types";

type Kind = "status" | "priority" | "tag";
type Item = Partial<TicketStatus & TicketPriority & Tag> & { id?: string };

function ItemModal({ kind, item, onClose }: { kind: Kind; item: Item | null; onClose: () => void }) {
  const api = kind === "status" ? statusesApi : kind === "priority" ? prioritiesApi : tagsApi;
  const create = api.useCreate();
  const update = api.useUpdate();
  const [form, setForm] = useState<Item>(item ?? { color: "#64748B", state: "open", level: 1, is_active: true });
  const isNew = !item?.id;
  const submit = () => {
    const { id: _id, is_system: _s, tickets_count: _t, ...data } = form as Record<string, unknown>;
    void _id; void _s; void _t;
    if (!isNew) delete (data as Record<string, unknown>).code;
    const opts = { onSuccess: () => { toast.success("ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (isNew) create.mutate(data, opts);
    else update.mutate({ id: item!.id!, data }, opts);
  };
  const title = { status: "وضعیت", priority: "اولویت", tag: "برچسب" }[kind];
  return (
    <Modal open onClose={onClose} size="sm" title={`${isNew ? "افزودن" : "ویرایش"} ${title}`} footer={<Button loading={create.isPending || update.isPending} onClick={submit}>ذخیره</Button>}>
      <div className="space-y-4">
        <FormField label="نام"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        {kind !== "tag" && isNew && <FormField label="کد (انگلیسی)"><Input className="ltr" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></FormField>}
        <FormField label="رنگ"><div className="flex gap-2"><input type="color" value={form.color ?? "#64748B"} onChange={(e) => setForm({ ...form, color: e.target.value.toUpperCase() })} className="h-10 w-12 rounded-lg border" aria-label="رنگ" /><Input className="ltr" value={form.color ?? ""} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div></FormField>
        {kind === "status" && (
          <>
            <FormField label="نوع وضعیت" hint="نوع وضعیت، رفتار SLA و گزارش‌ها را تعیین می‌کند.">
              <Select disabled={!!item?.is_system} value={form.state ?? "open"} onChange={(e) => setForm({ ...form, state: e.target.value as TicketStatus["state"] })} options={Object.entries(STATE_LABELS).map(([value, label]) => ({ value, label }))} />
            </FormField>
            <Switch checked={!!form.pauses_sla} onChange={(v) => setForm({ ...form, pauses_sla: v })} label="توقف SLA در این وضعیت" description="مثلاً زمانی که منتظر پاسخ مشتری هستیم." />
          </>
        )}
        {kind === "priority" && <FormField label="سطح اهمیت (۱ تا ۱۰)"><Input type="number" min={1} max={10} value={String(form.level ?? 1)} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} /></FormField>}
        {kind === "tag" && <FormField label="توضیحات"><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>}
        {kind !== "tag" && (
          <>
            <Switch checked={!!form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} label="پیش‌فرض" />
            <Switch checked={form.is_active !== false} onChange={(v) => setForm({ ...form, is_active: v })} label="فعال" />
          </>
        )}
      </div>
    </Modal>
  );
}

function Section({ kind, title, description, items }: { kind: Kind; title: string; description: string; items: Item[] | undefined }) {
  const api = kind === "status" ? statusesApi : kind === "priority" ? prioritiesApi : tagsApi;
  const remove = api.useRemove();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);
  return (
    <Card>
      <CardHeader title={title} description={description} actions={<Button size="sm" variant="outline" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> افزودن</Button>} />
      <ul className="divide-y">
        {items?.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
            <Badge color={i.color} dot>{i.name}</Badge>
            {i.code && <span className="font-mono text-[0.7rem] text-muted-foreground ltr">{i.code}</span>}
            {i.state && <Badge size="sm">{STATE_LABELS[i.state]}</Badge>}
            {i.level !== undefined && kind === "priority" && <Badge size="sm">سطح {formatNumber(i.level)}</Badge>}
            {i.pauses_sla && <Badge size="sm" tone="info">توقف SLA</Badge>}
            {i.is_default && <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-label="پیش‌فرض" />}
            {i.is_system && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="سیستمی" />}
            {i.is_active === false && <Badge size="sm">غیرفعال</Badge>}
            {kind === "tag" && <span className="text-xs text-muted-foreground">{formatNumber(i.tickets_count ?? 0)} تیکت</span>}
            <span className="ms-auto flex">
              <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => setEditing(i)}><Pencil className="h-4 w-4" /></Button>
              {!i.is_system && (
                <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => {
                  if (await confirm({ title: `حذف «${i.name}»` })) remove.mutate(i.id!, { onSuccess: () => toast.success("حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
                }}><Trash2 className="h-4 w-4" /></Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {editing !== undefined && <ItemModal kind={kind} item={editing} onClose={() => setEditing(undefined)} />}
    </Card>
  );
}

export default function TicketConfigPage() {
  const statuses = statusesApi.useList<TicketStatus[]>();
  const priorities = prioritiesApi.useList<TicketPriority[]>();
  const tags = tagsApi.useList<Tag[]>();
  return (
    <div className="space-y-6">
      <Section kind="status" title="وضعیت‌های تیکت" description="وضعیت‌های سیستمی قابل حذف نیستند اما نام و رنگ آن‌ها قابل تغییر است." items={statuses.data} />
      <Section kind="priority" title="اولویت‌ها" description="سطح اهمیت برای مرتب‌سازی و قوانین SLA استفاده می‌شود." items={priorities.data} />
      <Section kind="tag" title="برچسب‌ها" description="برچسب‌های دلخواه برای دسته‌بندی سریع تیکت‌ها (مانند vip، bug، follow-up)" items={tags.data} />
    </div>
  );
}
