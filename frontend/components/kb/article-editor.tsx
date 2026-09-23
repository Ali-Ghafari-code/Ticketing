"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kbCategoriesApi, useArticle, useSaveArticle } from "@/features/kb/api";
import { getErrorMessage } from "@/lib/errors";
import { stripHtml } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { KbCategory } from "@/types";

export function ArticleEditor({ id }: { id?: string }) {
  const existing = useArticle(id, false);
  const categories = kbCategoriesApi.useList<KbCategory[]>();
  const save = useSaveArticle();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", summary: "", content: "", category_id: "", tags: "", status: "draft", is_featured: false, slug: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const a = existing.data;
    if (a) setForm({ title: a.title, summary: a.summary ?? "", content: a.content, category_id: a.category_id ?? "", tags: a.tags.join("، "), status: a.status, is_featured: a.is_featured, slug: a.slug });
  }, [existing.data]);

  if (id && existing.isLoading) return <PageLoader />;

  const submit = (status: string) => {
    const e: Record<string, string> = {};
    if (form.title.trim().length < 3) e.title = "عنوان مقاله را وارد کنید";
    if (!stripHtml(form.content)) e.content = "متن مقاله را بنویسید";
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {
        id,
        data: {
          title: form.title,
          summary: form.summary || null,
          content: form.content,
          category_id: form.category_id || null,
          tags: form.tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean),
          status,
          is_featured: form.is_featured,
          slug: form.slug || null,
        },
      },
      {
        onSuccess: (a) => {
          toast.success(status === "published" ? "مقاله منتشر شد" : "پیش‌نویس ذخیره شد");
          router.replace(`/kb/${a.slug}`);
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <div>
      <PageHeader title={id ? "ویرایش مقاله" : "مقاله جدید"} breadcrumbs={[{ label: "پایگاه دانش", href: "/kb" }, { label: id ? "ویرایش" : "مقاله جدید" }]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardBody className="space-y-4">
            <FormField label="عنوان" required error={errors.title}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} invalid={!!errors.title} /></FormField>
            <FormField label="خلاصه" hint="در نتایج جستجو و فهرست مقالات نمایش داده می‌شود."><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={500} className="min-h-[70px]" /></FormField>
            <FormField label="متن مقاله" required error={errors.content}>
              <RichTextEditor value={form.content} onChange={(content) => setForm((f) => ({ ...f, content }))} editorClassName="min-h-[360px]" invalid={!!errors.content} />
            </FormField>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <FormField label="دسته‌بندی"><Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} placeholder="بدون دسته‌بندی" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></FormField>
              <FormField label="برچسب‌ها" hint="با ویرگول جدا کنید"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ورود، رمز عبور" /></FormField>
              <FormField label="نامک (slug)" hint="در صورت خالی بودن از عنوان ساخته می‌شود."><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="ltr text-start" /></FormField>
              <Switch checked={form.is_featured} onChange={(v) => setForm({ ...form, is_featured: v })} label="مقاله ویژه" description="در ابتدای فهرست نمایش داده می‌شود." />
            </CardBody>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" loading={save.isPending} onClick={() => submit("draft")}>ذخیره پیش‌نویس</Button>
            <Button className="flex-1" loading={save.isPending} onClick={() => submit("published")}>انتشار</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
