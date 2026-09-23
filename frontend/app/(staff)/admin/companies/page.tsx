"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { companiesApi, plansApi } from "@/features/companies/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useCompanyContext } from "@/store/company";
import { API_ORIGIN, SUBSCRIPTION_LABELS } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatNumber } from "@/lib/format";
import { zEmail, zMobile } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Company, Page, Plan } from "@/types";

function CompanyModal({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const create = companiesApi.useCreate();
  const update = companiesApi.useUpdate();
  const plans = plansApi.useList<Plan[]>();
  const [form, setForm] = useState({
    name: company?.name ?? "", slug: company?.slug ?? "", email: company?.email ?? "", phone: company?.phone ?? "",
    plan_id: company?.plan_id ?? "", subscription_status: company?.subscription_status ?? "trial",
    subscription_ends_at: company?.subscription_ends_at?.slice(0, 10) ?? null as string | null, is_active: company?.is_active ?? true,
    admin_full_name: "", admin_email: "", admin_mobile: "", admin_password: "",
  });
  const submit = () => {
    if (company) {
      update.mutate({ id: company.id, data: {
        name: form.name, email: form.email || null, phone: form.phone || null, plan_id: form.plan_id || null, subscription_status: form.subscription_status,
        subscription_ends_at: form.subscription_ends_at ? `${form.subscription_ends_at}T20:29:00Z` : null, is_active: form.is_active,
      } }, { onSuccess: () => { toast.success("سازمان ذخیره شد"); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) });
      return;
    }
    const mobile = zMobile.safeParse(form.admin_mobile);
    const email = zEmail.safeParse(form.admin_email);
    if (!mobile.success || !email.success) return toast.error("اطلاعات تماس مدیر سازمان معتبر نیست.");
    create.mutate({
      name: form.name, slug: form.slug, email: form.email || null, phone: form.phone || null, plan_id: form.plan_id || null,
      admin_full_name: form.admin_full_name, admin_email: email.data || null, admin_mobile: mobile.data || null, admin_password: form.admin_password,
    }, { onSuccess: () => { toast.success("سازمان و حساب مدیر آن ایجاد شد"); onClose(); }, onError: (e) => toast.error(getErrorMessage(e)) });
  };
  return (
    <Modal open onClose={onClose} size="lg" title={company ? `ویرایش ${company.name}` : "سازمان جدید"} footer={<Button loading={create.isPending || update.isPending} onClick={submit}>ذخیره</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="نام سازمان"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="شناسه (slug)" hint="در لینک ثبت‌نام مشتریان استفاده می‌شود"><Input disabled={!!company} className="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></FormField>
        <FormField label="ایمیل"><Input className="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="تلفن"><Input className="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="پلن اشتراک"><Select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })} placeholder="بدون پلن" options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></FormField>
        {company && (
          <>
            <FormField label="وضعیت اشتراک"><Select value={form.subscription_status} onChange={(e) => setForm({ ...form, subscription_status: e.target.value as Company["subscription_status"] })} options={Object.entries(SUBSCRIPTION_LABELS).map(([value, label]) => ({ value, label }))} /></FormField>
            <FormField label="اعتبار تا"><DatePicker value={form.subscription_ends_at} onChange={(v) => setForm({ ...form, subscription_ends_at: v })} /></FormField>
            <Switch className="self-end" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="سازمان فعال" />
          </>
        )}
        {!company && (
          <>
            <p className="border-t pt-4 text-sm font-semibold sm:col-span-2">حساب مدیر سازمان</p>
            <FormField label="نام مدیر"><Input value={form.admin_full_name} onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })} /></FormField>
            <FormField label="موبایل"><Input className="ltr" value={form.admin_mobile} onChange={(e) => setForm({ ...form, admin_mobile: e.target.value })} /></FormField>
            <FormField label="ایمیل"><Input className="ltr" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></FormField>
            <FormField label="رمز عبور اولیه"><Input type="password" className="ltr" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} /></FormField>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 350);
  const { data, isLoading } = companiesApi.useList<Page<Company>>({ q: debounced || undefined, page, page_size: 20 });
  const remove = companiesApi.useRemove();
  const confirm = useConfirm();
  const select = useCompanyContext((s) => s.select);
  const router = useRouter();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null });

  const enter = (c: Company) => {
    select(c.id, c.name);
    qc.removeQueries({ predicate: (qq) => !["companies", "plans", "platform-stats"].includes(String(qq.queryKey[0])) });
    router.push("/dashboard");
  };

  const columns: Column<Company>[] = [
    {
      id: "name", header: "سازمان", cell: (c) => (
        <div className="flex items-center gap-3">
          {c.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_ORIGIN}${c.logo_url}`} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : <span className="h-8 w-8 rounded-lg" style={{ backgroundColor: c.primary_color }} />}
          <div><p className="font-medium">{c.name}</p><p className="font-mono text-xs text-muted-foreground ltr text-start">{c.slug}</p></div>
        </div>
      ),
    },
    { id: "plan", header: "پلن", cell: (c) => <span className="text-xs">{c.plan?.name ?? "—"}</span> },
    { id: "sub", header: "اشتراک", cell: (c) => <div className="text-xs"><Badge tone={c.subscription_status === "active" ? "success" : c.subscription_status === "trial" ? "info" : "danger"}>{SUBSCRIPTION_LABELS[c.subscription_status]}</Badge><p className="mt-1 text-muted-foreground">تا {formatDate(c.subscription_ends_at)}</p></div> },
    { id: "stats", header: "کاربران / مشتریان / تیکت", cell: (c) => <span className="text-xs">{formatNumber(c.stats?.staff ?? 0)} / {formatNumber(c.stats?.customers ?? 0)} / {formatNumber(c.stats?.tickets ?? 0)}</span> },
    { id: "active", header: "وضعیت", cell: (c) => (c.is_active ? <Badge tone="success" dot>فعال</Badge> : <Badge dot>غیرفعال</Badge>) },
    {
      id: "actions", header: "", cell: (c) => (
        <div className="flex items-center gap-1">
          <Button size="xs" variant="subtle" onClick={() => enter(c)}><LogIn className="h-3.5 w-3.5" /> ورود به پنل</Button>
          <Dropdown trigger={<Button size="icon-sm" variant="ghost" aria-label="عملیات"><MoreHorizontal className="h-4 w-4" /></Button>} items={[
            { label: "ویرایش", icon: <Pencil className="h-4 w-4" />, onClick: () => setModal({ open: true, company: c }) },
            { label: "حذف", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => {
              if (await confirm({ title: `حذف سازمان ${c.name}`, description: "دسترسی همه کاربران این سازمان قطع خواهد شد.", confirmText: "حذف سازمان" }))
                remove.mutate(c.id, { onSuccess: () => toast.success("سازمان حذف شد"), onError: (e) => toast.error(getErrorMessage(e)) });
            } },
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="سازمان‌ها" description="مدیریت مشتریان سازمانی سامانه (Tenants)" actions={<Button onClick={() => setModal({ open: true, company: null })}><Plus className="h-4 w-4" /> سازمان جدید</Button>} />
      <DataTable
        columns={columns}
        data={data?.items}
        loading={isLoading}
        getRowId={(c) => c.id}
        toolbar={<Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام یا شناسه سازمان" icon={<Search className="h-4 w-4" />} className="h-9" />}
        footer={data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPageChange={setPage} />}
      />
      {modal.open && <CompanyModal company={modal.company} onClose={() => setModal({ open: false, company: null })} />}
    </div>
  );
}
