"use client";
import { useState } from "react";
import { ChevronDown, HelpCircle, Search } from "lucide-react";
import { faqApi, faqCategoriesApi } from "@/features/kb/api";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { RichContent } from "@/components/ui/rich-content";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import type { Faq, FaqCategory } from "@/types";

export function FaqView() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const debounced = useDebounce(q, 300);
  const categories = faqCategoriesApi.useList<FaqCategory[]>();
  const faqs = faqApi.useList<Faq[]>({ q: debounced || undefined, category_id: category || undefined });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <HelpCircle className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-2xl font-bold">سوالات متداول</h1>
        <p className="mt-2 text-sm text-muted-foreground">پاسخ پرتکرارترین پرسش‌های مشتریان</p>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در سوالات..." icon={<Search className="h-4 w-4" />} className="h-11" />
      {categories.data && categories.data.length > 0 && (
        <Tabs variant="pill" value={category} onChange={setCategory} items={[{ value: "", label: "همه" }, ...categories.data.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      {faqs.isLoading && <SkeletonRows rows={4} />}
      {faqs.data?.length === 0 && <EmptyState title="سوالی یافت نشد" />}
      <div className="space-y-2">
        {faqs.data?.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border bg-card">
              <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start text-sm font-medium" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                {f.question}
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && <div className="border-t px-5 py-4 text-muted-foreground"><RichContent html={f.answer} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
