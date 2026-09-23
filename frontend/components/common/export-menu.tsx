"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { toast } from "sonner";
import { downloadFile } from "@/lib/api";
import { getErrorMessageAsync } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";

/** Export dropdown (Excel / CSV / PDF) for any endpoint accepting a `fmt` query param. */
export function ExportMenu({ url, params = {}, filename, label = "خروجی" }: { url: string; params?: Record<string, unknown>; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (fmt: "xlsx" | "csv" | "pdf") => {
    setBusy(true);
    try {
      const search = new URLSearchParams();
      Object.entries({ ...params, fmt } as Record<string, unknown>).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        if (Array.isArray(v)) v.forEach((x) => search.append(k, String(x)));
        else search.set(k, String(v));
      });
      await downloadFile(`${url}?${search.toString()}`, `${filename}.${fmt}`);
      toast.success("فایل خروجی آماده شد");
    } catch (e) {
      toast.error(await getErrorMessageAsync(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dropdown
      trigger={<Button variant="outline" size="sm" loading={busy}><Download className="h-4 w-4" /> {label}</Button>}
      items={[
        { label: "Excel (xlsx)", icon: <FileSpreadsheet className="h-4 w-4 text-success" />, onClick: () => run("xlsx") },
        { label: "CSV", icon: <Sheet className="h-4 w-4 text-info" />, onClick: () => run("csv") },
        { label: "PDF", icon: <FileText className="h-4 w-4 text-danger" />, onClick: () => run("pdf") },
      ]}
    />
  );
}
