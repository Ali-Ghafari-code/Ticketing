"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { useCompanyOptions } from "@/features/companies/api";
import { useCompanyContext } from "@/store/company";

/** Lets a super admin act inside a tenant (sent as X-Company-Id on every request). */
export function CompanySwitcher() {
  const { selectedCompanyId, select } = useCompanyContext();
  const { data } = useCompanyOptions();
  const qc = useQueryClient();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <span className="sr-only">انتخاب سازمان</span>
      <select
        value={selectedCompanyId ?? ""}
        onChange={(e) => {
          const company = data?.find((c) => c.id === e.target.value);
          select(company?.id ?? null, company?.name ?? null);
          qc.removeQueries({ predicate: (q) => !["companies", "plans", "platform-stats", "system-settings"].includes(String(q.queryKey[0])) });
          router.push(company ? "/dashboard" : "/admin/stats");
        }}
        className="h-8 max-w-[11rem] bg-transparent text-xs outline-none"
      >
        <option value="">سطح سامانه (بدون سازمان)</option>
        {data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
