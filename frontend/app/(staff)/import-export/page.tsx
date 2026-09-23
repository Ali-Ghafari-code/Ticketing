"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadFile } from "@/lib/api";
import { useImportCommit, useImportPreview, type ImportPreview } from "@/features/settings/api";
import { usePermission } from "@/hooks/use-permission";
import { getErrorMessage, getErrorMessageAsync } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/common/export-menu";

const KINDS = [
  { value: "customers", label: "مشتریان" },
  { value: "users", label: "کاربران / کارشناسان" },
  { value: "categories", label: "دسته‌بندی‌ها" },
];

function Importer() {
  const [kind, setKind] = useState("customers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const previewMutation = useImportPreview(kind);
  const commit = useImportCommit(kind);

  const reset = () => {
    setFile(null);
    setPreview(null);
  };

  return (
    <Card>
      <CardHeader title="ورود اطلاعات از Excel" description="۱. قالب را دریافت کنید ۲. فایل را تکمیل و بارگذاری کنید ۳. پیش‌نمایش و خطاها را بررسی و ثبت کنید" icon={<Upload className="h-4 w-4" />} />
      <CardBody className="space-y-5">
        <Tabs variant="pill" value={kind} onChange={(v) => { setKind(v); reset(); }} items={KINDS} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => downloadFile(`/import/${kind}/template`, `${kind}-template.xlsx`).catch(async (e) => toast.error(await getErrorMessageAsync(e)))}>
            <Download className="h-4 w-4" /> دریافت قالب Excel
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 text-sm hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4 text-success" />
            {file ? <span className="max-w-[14rem] truncate ltr">{file.name}</span> : "انتخاب فایل xlsx"}
            <input type="file" accept=".xlsx" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); e.target.value = ""; }} />
          </label>
          <Button disabled={!file} loading={previewMutation.isPending} onClick={() => file && previewMutation.mutate(file, { onSuccess: setPreview, onError: (e) => toast.error(getErrorMessage(e)) })}>
            بررسی و پیش‌نمایش
          </Button>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>کل ردیف‌ها: {formatNumber(preview.total)}</Badge>
              <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> معتبر: {formatNumber(preview.valid)}</Badge>
              <Badge tone="danger"><AlertCircle className="h-3.5 w-3.5" /> دارای خطا: {formatNumber(preview.invalid)}</Badge>
              <Badge tone="warning"><Copy className="h-3.5 w-3.5" /> تکراری: {formatNumber(preview.duplicates)}</Badge>
              <label className="ms-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> فقط ردیف‌های دارای خطا</label>
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">ردیف</th>
                    {preview.columns.map((c) => <th key={c.key} className="px-3 py-2 text-start font-medium">{c.label.replace(" *", "")}</th>)}
                    <th className="px-3 py-2 text-start font-medium">نتیجه بررسی</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.filter((r) => !onlyErrors || !r.valid).map((r) => (
                    <tr key={r.row} className={cn("border-t", !r.valid && "bg-danger/[0.04]")}>
                      <td className="px-3 py-2">{formatNumber(r.row)}</td>
                      {preview.columns.map((c) => <td key={c.key} className="max-w-[12rem] truncate px-3 py-2">{r.data[c.key]}</td>)}
                      <td className="px-3 py-2">{r.valid ? <span className="text-success">معتبر</span> : <span className="text-danger">{r.errors.join(" / ")}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">فقط ردیف‌های معتبر ثبت می‌شوند؛ ردیف‌های دارای خطا نادیده گرفته می‌شوند.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>انصراف</Button>
                <Button
                  disabled={!preview.valid}
                  loading={commit.isPending}
                  onClick={() => commit.mutate(preview.rows, {
                    onSuccess: (r) => { toast.success(`${formatNumber(r.created)} ردیف ثبت شد${r.skipped ? ` (${formatNumber(r.skipped)} ردیف نادیده گرفته شد)` : ""}`); reset(); },
                    onError: (e) => toast.error(getErrorMessage(e)),
                  })}
                >
                  ثبت {formatNumber(preview.valid)} ردیف معتبر
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function ImportExportPage() {
  const { can } = usePermission();
  return (
    <div className="space-y-6">
      <PageHeader title="ورود و خروج اطلاعات" description="دریافت خروجی Excel/CSV/PDF و ورود گروهی اطلاعات از Excel" />
      <Card>
        <CardHeader title="دریافت خروجی" icon={<Download className="h-4 w-4" />} />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "تیکت‌ها", url: "/tickets/export", name: "tickets", perm: "tickets.export" },
            { label: "مشتریان", url: "/customers/export", name: "customers", perm: "customers.view" },
            { label: "کارشناسان و کاربران", url: "/users/export", name: "agents", perm: "users.view" },
            { label: "گزارش عملکرد کارشناسان", url: "/reports/export", name: "agents-report", perm: "reports.export", params: { report: "by_agent" } },
          ].filter((x) => can(x.perm)).map((x) => (
            <div key={x.name} className="flex items-center justify-between rounded-xl border p-4">
              <span className="text-sm font-medium">{x.label}</span>
              <ExportMenu url={x.url} filename={x.name} params={x.params} label="دریافت" />
            </div>
          ))}
        </CardBody>
      </Card>
      {can("import.manage") && <Importer />}
    </div>
  );
}
