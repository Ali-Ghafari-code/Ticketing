"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { faqApi, faqCategoriesApi, useReorderFaq } from "@/features/kb/api";
import { getErrorMessage } from "@/lib/errors";
import { stripHtml } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Faq, FaqCategory } from "@/types";

function FaqModal({ faq, open, onClose, categories }: { faq?: Faq | null; open: boolean; onClose: () => void; categories: FaqCategory[] }) {
  const create = faqApi.useCreate();
  const update = faqApi.useUpdate();
  const [form, setForm] = useState({ question: "", answer: "", category_id: "", is_published: true });
  useEffect(() => {
    if (open) setForm({ question: faq?.question ?? "", answer: faq?.answer ?? "", category_id: faq?.category_id ?? "", is_published: faq?.is_published ?? true });
  }, [open, faq]);
  const submit = () => {
    if (form.question.trim().length < 3 || !stripHtml(form.answer)) return toast.error("سوال و پاسخ را کامل کنید.");
    const data = { ...form, category_id: form.category_id || null };
    const opts = { onSuccess: () => { toast.success("ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (faq) update.mutate({ id: faq.id, data }, opts);
    else create.mutate(data, opts);
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={faq ? "ویرایش سوال" : "سوال جدید"} footer={<><Button variant="outline" onClick={onClose}>انصراف</Button><Button onClick={submit} loading={create.isPending || update.isPending}>ذخیره</Button></>}>
      <div className="space-y-4">
        <FormField label="سوال" required><Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></FormField>
        <FormField label="پاسخ" required><RichTextEditor value={form.answer} onChange={(answer) => setForm((f) => ({ ...f, answer }))} minimal /></FormField>
        <FormField label="دسته‌بندی"><Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} placeholder="بدون دسته‌بندی" options={categories.map((c) => ({ value: c.id, label: c.name }))} /></FormField>
        <Switch checked={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} label="نمایش در پورتال مشتریان" />
      </div>
    </Modal>
  );
}

export default function FaqManagePage() {
  const [category, setCategory] = useState("");
  const faqs = faqApi.useList<Faq[]>({ category_id: category || undefined });
  const categories = faqCategoriesApi.useList<FaqCategory[]>();
  const createCategory = faqCategoriesApi.useCreate();
  const removeCategory = faqCategoriesApi.useRemove();
  const remove = faqApi.useRemove();
  const reorder = useReorderFaq();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ open: boolean; faq?: Faq | null }>({ open: false });
  const [newCat, setNewCat] = useState("");
  const [catOpen, setCatOpen] = useState(false);

  const move = (index: number, dir: -1 | 1) => {
    const list = [...(faqs.data ?? [])];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    reorder.mutate(list.map((f) => f.id), { onError: (e) => toast.error(getErrorMessage(e)) });
  };

  return (
    <div>
      <PageHeader
        title="سوالات متداول"
        description="مدیریت و ترتیب نمایش سوالات متداول در پورتال مشتریان"
        actions={<><Button variant="outline" onClick={() => setCatOpen(true)}><FolderPlus className="h-4 w-4" /> دسته‌بندی</Button><Button onClick={() => setModal({ open: true, faq: null })}><Plus className="h-4 w-4" /> سوال جدید</Button></>}
      />
      <Tabs className="mb-4" variant="pill" value={category} onChange={setCategory} items={[{ value: "", label: "همه" }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
      <Card>
        <CardHeader title="فهرست سوالات" description="با دکمه‌های جابه‌جایی، ترتیب نمایش را تغییر دهید." />
        {faqs.isLoading && <div className="p-5"><SkeletonRows rows={4} /></div>}
        {faqs.data?.length === 0 && <EmptyState title="سوالی ثبت نشده است" />}
        <ul className="divide-y">
          {faqs.data?.map((f, i) => (
            <li key={f.id} className="flex items-start gap-3 px-5 py-3">
              <div className="flex flex-col">
                <button className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label="انتقال به بالا"><ArrowUp className="h-4 w-4" /></button>
                <button className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === (faqs.data?.length ?? 0) - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label="انتقال به پایین"><ArrowDown className="h-4 w-4" /></button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{f.question}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">{stripHtml(f.answer)}</p>
                <div className="mt-1 flex gap-2">
                  {f.category && <Badge size="sm">{f.category.name}</Badge>}
                  {!f.is_published && <Badge size="sm" tone="warning">منتشر نشده</Badge>}
                </div>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="ویرایش" onClick={() => setModal({ open: true, faq: f })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => {
                if (await confirm({ title: "حذف سوال", description: f.question })) remove.mutate(f.id, { onSuccess: () => toast.success("حذف شد") });
              }}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </Card>
      <FaqModal open={modal.open} faq={modal.faq} categories={categories.data ?? []} onClose={() => setModal({ open: false })} />
      <Modal open={catOpen} onClose={() => setCatOpen(false)} size="sm" title="دسته‌بندی‌های سوالات">
        <ul className="mb-4 divide-y rounded-lg border">
          {categories.data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              {c.name}
              <button className="text-danger" onClick={() => removeCategory.mutate(c.id)} aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="نام دسته‌بندی جدید" />
          <Button disabled={newCat.trim().length < 2} loading={createCategory.isPending} onClick={() => createCategory.mutate({ name: newCat, sort_order: categories.data?.length ?? 0 }, { onSuccess: () => setNewCat(""), onError: (e) => toast.error(getErrorMessage(e)) })}>افزودن</Button>
        </div>
      </Modal>
    </div>
  );
}
