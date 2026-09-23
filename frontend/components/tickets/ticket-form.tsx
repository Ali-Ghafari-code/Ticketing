"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, CheckCircle2, Lightbulb, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateTicket, useTicketMeta } from "@/features/tickets/api";
import { useSuggestArticles } from "@/features/kb/api";
import { searchCustomers } from "@/features/users/api";
import { useDebounce } from "@/hooks/use-debounce";
import { applyFieldErrors, getErrorMessage } from "@/lib/errors";
import { stripHtml } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { FileUploader } from "@/components/ui/file-uploader";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import type { User } from "@/types";
import { flattenCategories } from "./ticket-detail";

const schema = z.object({
  subject: z.string().trim().min(3, "موضوع باید حداقل ۳ کاراکتر باشد").max(255, "موضوع بیش از حد طولانی است"),
  description: z.string().refine((v) => stripHtml(v).length > 0, "شرح مشکل را بنویسید"),
  category_id: z.string().optional(),
  department_id: z.string().optional(),
  priority_id: z.string().optional(),
  customer_id: z.string().optional(),
  assigned_agent_id: z.string().optional(),
  tag_ids: z.array(z.string()).optional(),
  due_date: z.string().nullable().optional(),
  channel: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function CustomerPicker({ value, onChange, invalid }: { value?: string; onChange: (id: string, user?: User) => void; invalid?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [results, setResults] = useState<User[]>([]);
  const debounced = useDebounce(q, 300);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    searchCustomers(debounced).then(setResults).catch(() => setResults([]));
  }, [debounced, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (value && selected) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-3">
        <Avatar name={selected.full_name} size="xs" />
        <span className="flex-1 truncate text-sm">{selected.full_name}</span>
        <span className="text-xs text-muted-foreground ltr">{selected.mobile ?? selected.email}</span>
        <button type="button" onClick={() => { setSelected(null); onChange(""); }} aria-label="تغییر مشتری" className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Input
        value={q}
        invalid={invalid}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder="جستجوی نام، موبایل یا ایمیل مشتری..."
        icon={<Search className="h-4 w-4" />}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-card p-1 shadow-pop">
          {results.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">مشتری یافت نشد. <Link className="text-primary" href="/customers?new=1">ایجاد مشتری جدید</Link></p>}
          {results.map((u) => (
            <button key={u.id} type="button" onClick={() => { setSelected(u); onChange(u.id, u); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start hover:bg-muted">
              <Avatar name={u.full_name} src={u.avatar_url} size="xs" />
              <span className="flex-1 truncate text-sm">{u.full_name}</span>
              <span className="text-xs text-muted-foreground ltr">{u.mobile ?? u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TicketCreateForm({ mode }: { mode: "portal" | "staff" }) {
  const { data: meta, isLoading } = useTicketMeta();
  const create = useCreateTicket();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [created, setCreated] = useState<{ id: string; code: string; message: string } | null>(null);
  const [dismissedKb, setDismissedKb] = useState(false);
  const { control, register, handleSubmit, setValue, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { subject: "", description: "", channel: mode === "staff" ? "phone" : "web", tag_ids: [] },
  });
  const subject = useWatch({ control, name: "subject" });
  const categoryId = useWatch({ control, name: "category_id" });
  const debouncedSubject = useDebounce(subject ?? "", 500);
  const suggestions = useSuggestArticles(mode === "portal" && meta?.settings.kb_suggest_before_ticket && !dismissedKb ? debouncedSubject : "");
  const categories = useMemo(() => flattenCategories(meta?.categories ?? []), [meta]);

  // Auto-select the department configured for the chosen category (routing hint for the customer).
  useEffect(() => {
    if (!meta || !categoryId) return;
    const find = (nodes: typeof meta.categories): string | null => {
      for (const n of nodes) {
        if (n.id === categoryId) return n.department_id;
        const child = find(n.children ?? []);
        if (child) return child;
      }
      return null;
    };
    const dept = find(meta.categories);
    if (dept) setValue("department_id", dept);
  }, [categoryId, meta, setValue]);

  if (isLoading || !meta) return <PageLoader />;
  const s = meta.settings;
  const showPriority = mode === "staff" || s.customer_can_select_priority;
  const showDepartment = mode === "staff" || s.customer_can_select_department;
  const base = mode === "portal" ? "/portal/tickets" : "/tickets";

  const onSubmit = handleSubmit((v) => {
    if (mode === "staff" && !v.customer_id) return setError("customer_id", { message: "انتخاب مشتری الزامی است" });
    if (s.require_category && !v.category_id) return setError("category_id", { message: "انتخاب دسته‌بندی الزامی است" });
    create.mutate(
      {
        data: {
          subject: v.subject,
          description: v.description,
          category_id: v.category_id || null,
          department_id: v.department_id || null,
          priority_id: v.priority_id || null,
          customer_id: v.customer_id || null,
          assigned_agent_id: v.assigned_agent_id || null,
          tag_ids: v.tag_ids ?? [],
          due_date: v.due_date ? `${v.due_date}T20:29:00Z` : null,
          channel: v.channel,
        },
        files,
      },
      {
        onSuccess: (res) => setCreated(res),
        onError: (e) => {
          applyFieldErrors(e, setError);
          toast.error(getErrorMessage(e));
        },
      },
    );
  });

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" noValidate>
        <Card>
          <CardBody className="space-y-5">
            {mode === "staff" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="مشتری" required error={errors.customer_id?.message} className="sm:col-span-2">
                  <Controller control={control} name="customer_id" render={({ field }) => <CustomerPicker value={field.value} onChange={(id) => field.onChange(id)} invalid={!!errors.customer_id} />} />
                </FormField>
              </div>
            )}
            <FormField label="موضوع" required error={errors.subject?.message}>
              <Input placeholder="خلاصه‌ای از مشکل یا درخواست" invalid={!!errors.subject} {...register("subject")} maxLength={255} />
            </FormField>

            {suggestions.data && suggestions.data.length > 0 && (
              <div className="rounded-xl border border-info/30 bg-info/[0.05] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium"><Lightbulb className="h-4 w-4 text-info" /> شاید این مقالات پاسخ شما را داشته باشند:</p>
                  <button type="button" onClick={() => setDismissedKb(true)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="بستن پیشنهادها"><X className="h-4 w-4" /></button>
                </div>
                <ul className="mt-2 space-y-1">
                  {suggestions.data.map((a) => (
                    <li key={a.id}>
                      <Link href={`/portal/kb/${a.slug}`} target="_blank" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-info hover:bg-info/10">
                        <BookOpen className="h-4 w-4" /> {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="دسته‌بندی" required={s.require_category} error={errors.category_id?.message}>
                <Select placeholder="انتخاب دسته‌بندی" options={categories} invalid={!!errors.category_id} {...register("category_id")} />
              </FormField>
              {showDepartment && (
                <FormField label="دپارتمان" hint="در صورت انتخاب دسته‌بندی، دپارتمان به صورت خودکار تعیین می‌شود.">
                  <Select placeholder="تعیین خودکار" options={meta.departments.map((d) => ({ value: d.id, label: d.name }))} {...register("department_id")} />
                </FormField>
              )}
              {showPriority && (
                <FormField label="اولویت">
                  <Select placeholder="پیش‌فرض" options={meta.priorities.map((p) => ({ value: p.id, label: p.name }))} {...register("priority_id")} />
                </FormField>
              )}
              {mode === "staff" && (
                <FormField label="کانال دریافت">
                  <Select options={[{ value: "phone", label: "تماس تلفنی" }, { value: "email", label: "ایمیل" }, { value: "chat", label: "چت" }, { value: "web", label: "وب" }]} {...register("channel")} />
                </FormField>
              )}
            </div>

            <FormField label="شرح کامل" required error={errors.description?.message}>
              <Controller
                control={control}
                name="description"
                render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} invalid={!!errors.description} placeholder="مشکل را با جزئیات توضیح دهید: چه اتفاقی افتاد، چه انتظاری داشتید و چه مراحلی را انجام داده‌اید." editorClassName="min-h-[180px]" />}
              />
            </FormField>

            <FormField label="فایل‌های پیوست">
              <FileUploader files={files} onChange={setFiles} maxSizeMb={s.max_upload_size_mb} maxFiles={s.max_files} accept={s.allowed_extensions} />
            </FormField>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {mode === "staff" && (
            <Card>
              <CardBody className="space-y-4">
                <FormField label="ارجاع به کارشناس" hint="خالی بگذارید تا طبق قوانین ارجاع خودکار تعیین شود.">
                  <Select placeholder="ارجاع خودکار" options={(meta.agents ?? []).map((a) => ({ value: a.id, label: a.full_name }))} {...register("assigned_agent_id")} />
                </FormField>
                <FormField label="موعد انجام">
                  <Controller control={control} name="due_date" render={({ field }) => <DatePicker value={field.value ?? null} onChange={field.onChange} />} />
                </FormField>
                {meta.tags && meta.tags.length > 0 && (
                  <FormField label="برچسب‌ها">
                    <Controller
                      control={control}
                      name="tag_ids"
                      render={({ field }) => (
                        <div className="flex flex-wrap gap-1.5">
                          {meta.tags!.map((t) => {
                            const on = field.value?.includes(t.id);
                            return (
                              <button
                                type="button"
                                key={t.id}
                                onClick={() => field.onChange(on ? field.value!.filter((x) => x !== t.id) : [...(field.value ?? []), t.id])}
                                className="rounded-md border px-2 py-1 text-xs transition"
                                style={on ? { backgroundColor: `${t.color}1A`, color: t.color, borderColor: `${t.color}55` } : undefined}
                                aria-pressed={on}
                              >
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    />
                  </FormField>
                )}
              </CardBody>
            </Card>
          )}
          {mode === "portal" && (
            <Card>
              <CardBody className="space-y-2 text-xs leading-6 text-muted-foreground">
                <p className="font-semibold text-foreground">راهنمای ثبت تیکت</p>
                <p>• برای هر مشکل یک تیکت جداگانه ثبت کنید.</p>
                <p>• تصویر خطا یا فایل‌های مرتبط را پیوست کنید.</p>
                <p>• پیش از ثبت، <Link href="/portal/kb" className="text-primary">پایگاه دانش</Link> را جستجو کنید.</p>
              </CardBody>
            </Card>
          )}
          <div className="sticky bottom-20 flex gap-2 md:bottom-4">
            <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">انصراف</Button>
            <Button type="submit" loading={create.isPending} className="flex-[2]">ثبت تیکت</Button>
          </div>
        </div>
      </form>

      <Modal open={!!created} onClose={() => created && router.replace(`${base}/${created.id}`)} size="sm" closeOnOverlay={false}>
        {created && (
          <div className="py-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="h-8 w-8" /></span>
            <h2 className="mt-4 text-lg font-bold">تیکت با موفقیت ثبت شد</h2>
            <p className="mt-2 text-sm text-muted-foreground">شماره پیگیری تیکت شما:</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-primary ltr">{created.code}</p>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">نتیجه بررسی از طریق اعلان‌ها و پیامک/ایمیل به شما اطلاع داده می‌شود.</p>
            <Button className="mt-6 w-full" onClick={() => router.replace(`${base}/${created.id}`)}>مشاهده تیکت</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
