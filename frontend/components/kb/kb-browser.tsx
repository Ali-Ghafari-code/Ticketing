"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Eye, Search, Star, ThumbsUp } from "lucide-react";
import { kbCategoriesApi, useArticles } from "@/features/kb/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlState } from "@/hooks/use-url-state";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { KbCategory } from "@/types";

const DEFAULTS = { q: "", category_id: "", tag: "", page: 1 };

function Inner({ basePath }: { basePath: string }) {
  const [state, setState] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounce(search, 400);
  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const categories = kbCategoriesApi.useList<KbCategory[]>();
  const articles = useArticles({ q: state.q || undefined, category_id: state.category_id || undefined, tag: state.tag || undefined, page: state.page, page_size: 12, sort: "popular" });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-l from-primary/10 via-card to-card p-6 text-center sm:p-10">
        <BookOpen className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-xl font-bold sm:text-2xl">پایگاه دانش</h1>
        <p className="mt-2 text-sm text-muted-foreground">پاسخ پرسش‌های رایج و راهنمای استفاده از خدمات</p>
        <div className="mx-auto mt-5 max-w-xl">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در مقالات..." icon={<Search className="h-4 w-4" />} className="h-11 bg-card" autoFocus />
        </div>
        {state.tag && (
          <p className="mt-3 text-xs">
            برچسب: <Badge tone="primary">{state.tag}</Badge>{" "}
            <button className="text-primary" onClick={() => setState({ tag: "" })}>حذف</button>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav className="space-y-1" aria-label="دسته‌بندی مقالات">
          <button onClick={() => setState({ category_id: "" })} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm", !state.category_id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted")}>
            همه مقالات
          </button>
          {categories.data?.map((c) => (
            <button key={c.id} onClick={() => setState({ category_id: c.id })} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm", state.category_id === c.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted")}>
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">{formatNumber(c.articles_count)}</span>
            </button>
          ))}
        </nav>
        <div>
          {articles.isLoading && <SkeletonRows rows={4} />}
          {articles.data && articles.data.items.length === 0 && <EmptyState title="مقاله‌ای یافت نشد" description="عبارت دیگری را جستجو کنید یا تیکت ثبت کنید." />}
          <div className="grid gap-3 sm:grid-cols-2">
            {articles.data?.items.map((a) => (
              <Link key={a.id} href={`${basePath}/${a.slug}`}>
                <Card className="h-full p-4 transition hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-7">{a.title}</h3>
                    {a.is_featured && <Star className="h-4 w-4 shrink-0 fill-warning text-warning" aria-label="مقاله ویژه" />}
                  </div>
                  {a.summary && <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">{a.summary}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.7rem] text-muted-foreground">
                    {a.category && <Badge size="sm">{a.category.name}</Badge>}
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNumber(a.views)}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {formatNumber(a.helpful_count)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {articles.data && articles.data.pages > 1 && (
            <Pagination className="mt-4" page={articles.data.page} pages={articles.data.pages} total={articles.data.total} pageSize={articles.data.page_size} onPageChange={(page) => setState({ page }, { resetPage: false })} />
          )}
        </div>
      </div>
    </div>
  );
}

export function KbBrowser({ basePath }: { basePath: string }) {
  return <Suspense><Inner basePath={basePath} /></Suspense>;
}
