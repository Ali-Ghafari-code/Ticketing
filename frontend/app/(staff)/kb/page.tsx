"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, FolderPlus, Pencil, Plus, Search, Star, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { kbCategoriesApi, useArticles, useDeleteArticle } from "@/features/kb/api";
import { useDebounce } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/errors";
import { formatNumber, timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { KbArticleListItem, KbCategory } from "@/types";

function CategoryModal({ category, open, onClose }: { category?: KbCategory | null; open: boolean; onClose: () => void }) {
  const create = kbCategoriesApi.useCreate();
  const update = kbCategoriesApi.useUpdate();
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const submit = () => {
    const data = { name, description: description || null, sort_order: category?.sort_order ?? 0, is_active: true };
    const opts = { onSuccess: () => { toast.success("دسته‌بندی ذخیره شد"); onClose(); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (category) update.mutate({ id: category.id, data }, opts);
    else create.mutate(data, opts);
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={category ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"} footer={<Button onClick={submit} loading={create.isPending || update.isPending} disabled={name.trim().length < 2}>ذخیره</Button>}>
      <div className="space-y-4">
        <FormField label="نام"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
        <FormField label="توضیحات"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[70px]" /></FormField>
      </div>
    </Modal>
  );
}

export default function KbManagePage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 350);
  const articles = useArticles({ q: debounced || undefined, status: status || undefined, category_id: categoryId || undefined, page, page_size: 15, sort: "recent" });
  const categories = kbCategoriesApi.useList<KbCategory[]>();
  const removeCategory = kbCategoriesApi.useRemove();
  const del = useDeleteArticle();
  const confirm = useConfirm();
  const [catModal, setCatModal] = useState<{ open: boolean; category?: KbCategory | null }>({ open: false });

  const columns: Column<KbArticleListItem>[] = [
    {
      id: "title",
      header: "عنوان",
      cell: (a) => (
        <Link href={`/kb/${a.slug}`} className="block min-w-[14rem]">
          <span className="flex items-center gap-1.5 font-medium hover:text-primary">{a.is_featured && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}{a.title}</span>
          <span className="line-clamp-1 text-xs text-muted-foreground">{a.summary}</span>
        </Link>
      ),
    },
    { id: "category", header: "دسته‌بندی", cell: (a) => <span className="text-xs">{a.category?.name ?? "—"}</span> },
    { id: "status", header: "وضعیت", cell: (a) => (a.status === "published" ? <Badge tone="success">منتشر شده</Badge> : <Badge tone="warning">پیش‌نویس</Badge>) },
    { id: "stats", header: "آمار", cell: (a) => <span className="flex gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(a.views)}</span><span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatNumber(a.helpful_count)}</span></span> },
    { id: "updated", header: "به‌روزرسانی", cell: (a) => <span className="text-xs text-muted-foreground">{timeAgo(a.updated_at)}</span> },
    {
      id: "actions",
      header: "",
      cell: (a) => (
        <div className="flex">
          <Link href={`/kb/edit/${a.id}`}><Button size="icon-sm" variant="ghost" aria-label="ویرایش"><Pencil className="h-4 w-4" /></Button></Link>
          <Button size="icon-sm" variant="danger-ghost" aria-label="حذف" onClick={async () => {
            if (await confirm({ title: "حذف مقاله", description: a.title, confirmText: "حذف" })) del.mutate(a.id, { onSuccess: () => toast.success("مقاله حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
          }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="مدیریت پایگاه دانش" description="مقالات راهنما برای کاهش تیکت‌های تکراری" actions={<Link href="/kb/new"><Button><Plus className="h-4 w-4" /> مقاله جدید</Button></Link>} />
      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader title="دسته‌بندی‌ها" actions={<Button size="icon-sm" variant="ghost" aria-label="دسته‌بندی جدید" onClick={() => setCatModal({ open: true, category: null })}><FolderPlus className="h-4 w-4" /></Button>} />
          <ul className="divide-y">
            {categories.data?.map((c) => (
              <li key={c.id} className="group flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(c.articles_count)}</span>
                <button className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" onClick={() => setCatModal({ open: true, category: c })} aria-label="ویرایش"><Pencil className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 text-danger opacity-0 hover:bg-danger/10 group-hover:opacity-100" aria-label="حذف" onClick={async () => {
                  if (await confirm({ title: `حذف دسته‌بندی ${c.name}`, description: "مقالات این دسته‌بندی بدون دسته‌بندی خواهند شد." })) removeCategory.mutate(c.id, { onSuccess: () => toast.success("حذف شد") });
                }}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </Card>
        <DataTable
          columns={columns}
          data={articles.data?.items}
          loading={articles.isLoading}
          getRowId={(a) => a.id}
          toolbar={
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[12rem] flex-1"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو در مقالات..." icon={<Search className="h-4 w-4" />} className="h-9" /></div>
              <Select size="sm" className="h-9 w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="همه وضعیت‌ها" options={[{ value: "published", label: "منتشر شده" }, { value: "draft", label: "پیش‌نویس" }]} />
              <Select size="sm" className="h-9 w-40" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} placeholder="همه دسته‌بندی‌ها" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          }
          footer={articles.data && <Pagination page={articles.data.page} pages={articles.data.pages} total={articles.data.total} pageSize={articles.data.page_size} onPageChange={setPage} />}
        />
      </div>
      {catModal.open && <CategoryModal open category={catModal.category} onClose={() => setCatModal({ open: false })} />}
    </div>
  );
}
