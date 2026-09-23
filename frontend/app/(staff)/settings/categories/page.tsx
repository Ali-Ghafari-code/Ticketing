"use client";
import { useState } from "react";
import { ChevronDown, CornerDownLeft, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { categoriesApi, departmentsApi, prioritiesApi } from "@/features/config/api";
import { useAgents } from "@/features/users/api";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { flattenCategories } from "@/components/tickets/ticket-detail";
import type { Category, Department, TicketPriority } from "@/types";

type Draft = Partial<Category> & { parent_id?: string | null };

function CategoryModal({ draft, tree, onClose }: { draft: Draft; tree: Category[]; onClose: () => void }) {
  const create = categoriesApi.useCreate();
  const update = categoriesApi.useUpdate();
  const departments = departmentsApi.useList<Department[]>();
  const priorities = prioritiesApi.useList<TicketPriority[]>();
  const agents = useAgents();
  const [form, setForm] = useState<Draft>(draft);
  const submit = () => {
    const data = {
      name: form.name ?? "", description: form.description || null, parent_id: form.parent_id || null, department_id: form.department_id || null,
      default_agent_id: form.default_agent_id || null, default_priority_id: form.default_priority_id || null, is_active: form.is_active !== false, sort_order: form.sort_order ?? 0,
    };
    const opts = { onSuccess: () => { toast.success("دسته‌بندی ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (draft.id) update.mutate({ id: draft.id, data }, opts);
    else create.mutate(data, opts);
  };
  return (
    <Modal open onClose={onClose} title={draft.id ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"} footer={<Button loading={create.isPending || update.isPending} onClick={submit} disabled={(form.name ?? "").trim().length < 2}>ذخیره</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام" className="sm:col-span-2"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="دسته‌بندی والد" className="sm:col-span-2"><Select value={form.parent_id ?? ""} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} placeholder="— سطح اول —" options={flattenCategories(tree).filter((c) => c.value !== draft.id)} /></FormField>
        <FormField label="مسیریابی به دپارتمان" hint="تیکت‌های این دسته‌بندی به این دپارتمان ارجاع می‌شوند."><Select value={form.department_id ?? ""} onChange={(e) => setForm({ ...form, department_id: e.target.value })} placeholder="بدون مسیریابی" options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></FormField>
        <FormField label="کارشناس پیش‌فرض"><Select value={form.default_agent_id ?? ""} onChange={(e) => setForm({ ...form, default_agent_id: e.target.value })} placeholder="طبق قوانین دپارتمان" options={(agents.data ?? []).map((a) => ({ value: a.id, label: a.full_name }))} /></FormField>
        <FormField label="اولویت پیش‌فرض"><Select value={form.default_priority_id ?? ""} onChange={(e) => setForm({ ...form, default_priority_id: e.target.value })} placeholder="پیش‌فرض سازمان" options={(priorities.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></FormField>
        <FormField label="ترتیب نمایش"><Input type="number" value={String(form.sort_order ?? 0)} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></FormField>
        <FormField label="توضیحات" className="sm:col-span-2"><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[70px]" /></FormField>
        <Switch className="sm:col-span-2" checked={form.is_active !== false} onChange={(v) => setForm({ ...form, is_active: v })} label="فعال" />
      </div>
    </Modal>
  );
}

function Node({ node, depth, onEdit, onAdd, onDelete, departments }: { node: Category; depth: number; onEdit: (c: Category) => void; onAdd: (parent: Category) => void; onDelete: (c: Category) => void; departments: Record<string, string> }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <div className={cn("group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60")} style={{ paddingInlineStart: `${depth * 1.5 + 0.5}rem` }}>
        {node.children.length > 0 ? (
          <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground" aria-label={open ? "بستن" : "باز کردن"}><ChevronDown className={cn("h-4 w-4 transition", !open && "rotate-90")} /></button>
        ) : depth > 0 ? <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground/60" /> : <span className="w-5" />}
        <span className={cn("text-sm", depth === 0 && "font-semibold", !node.is_active && "text-muted-foreground line-through")}>{node.name}</span>
        {node.department_id && <Badge size="sm" tone="info">{departments[node.department_id] ?? "دپارتمان"}</Badge>}
        <span className="text-xs text-muted-foreground">{formatNumber(node.tickets_count)} تیکت</span>
        <span className="ms-auto flex opacity-60 group-hover:opacity-100">
          <Button size="icon-sm" variant="ghost" aria-label="افزودن زیرمجموعه" onClick={() => onAdd(node)}><Plus className="h-4 w-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => onEdit(node)}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={() => onDelete(node)}><Trash2 className="h-4 w-4" /></Button>
        </span>
      </div>
      {open && node.children.length > 0 && (
        <ul>{node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} departments={departments} />)}</ul>
      )}
    </li>
  );
}

export default function CategoriesPage() {
  const { data, isLoading } = categoriesApi.useList<Category[]>();
  const departments = departmentsApi.useList<Department[]>();
  const remove = categoriesApi.useRemove();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const deptNames = Object.fromEntries((departments.data ?? []).map((d) => [d.id, d.name]));
  if (isLoading) return <PageLoader />;
  return (
    <Card>
      <CardHeader title="دسته‌بندی‌های تیکت" icon={<FolderTree className="h-4 w-4" />} description="ساختار درختی دسته‌بندی‌ها و مسیریابی خودکار به دپارتمان‌ها" actions={<Button size="sm" onClick={() => setDraft({})}><Plus className="h-4 w-4" /> دسته‌بندی اصلی</Button>} />
      <div className="p-3">
        {data?.length === 0 && <EmptyState title="دسته‌بندی تعریف نشده است" />}
        <ul>
          {data?.map((c) => (
            <Node key={c.id} node={c} depth={0} departments={deptNames}
              onEdit={(n) => setDraft(n)}
              onAdd={(p) => setDraft({ parent_id: p.id, department_id: p.department_id })}
              onDelete={async (n) => {
                if (await confirm({ title: `حذف «${n.name}»`, description: "تیکت‌های این دسته‌بندی بدون دسته‌بندی خواهند شد." })) remove.mutate(n.id, { onSuccess: () => toast.success("حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
              }}
            />
          ))}
        </ul>
      </div>
      {draft && <CategoryModal draft={draft} tree={data ?? []} onClose={() => setDraft(null)} />}
    </Card>
  );
}
