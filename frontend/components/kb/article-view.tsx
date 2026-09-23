"use client";
import Link from "next/link";
import { ArrowRight, Eye, Pencil, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useArticle, useArticleFeedback } from "@/features/kb/api";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RichContent } from "@/components/ui/rich-content";
import { PageLoader } from "@/components/ui/spinner";

export function ArticleView({ slug, basePath, editHref, ticketHref }: { slug: string; basePath: string; editHref?: string; ticketHref?: string }) {
  const { data: article, isLoading, error } = useArticle(slug);
  const feedback = useArticleFeedback();
  if (isLoading) return <PageLoader />;
  if (error || !article) return <EmptyState title="مقاله یافت نشد" action={<Link href={basePath} className="text-sm text-primary">بازگشت به پایگاه دانش</Link>} />;

  const vote = (helpful: boolean) =>
    feedback.mutate({ key: article.id, helpful }, { onSuccess: () => toast.success("از بازخورد شما سپاسگزاریم"), onError: (e) => toast.error(getErrorMessage(e)) });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article>
        <Link href={basePath} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> پایگاه دانش</Link>
        <Card>
          <CardBody className="sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {article.category && <Badge tone="primary">{article.category.name}</Badge>}
              {article.status === "draft" && <Badge tone="warning">پیش‌نویس</Badge>}
              <span>به‌روزرسانی: {formatDate(article.updated_at)}</span>
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatNumber(article.views)} بازدید</span>
              {editHref && <Link href={editHref} className="ms-auto"><Button size="xs" variant="outline"><Pencil className="h-3 w-3" /> ویرایش</Button></Link>}
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-10">{article.title}</h1>
            {article.summary && <p className="mt-2 text-sm leading-7 text-muted-foreground">{article.summary}</p>}
            <RichContent html={article.content} className="mt-6 text-[0.95rem] leading-8" />
            {article.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {article.tags.map((t) => <Link key={t} href={`${basePath}?tag=${encodeURIComponent(t)}`}><Badge>#{t}</Badge></Link>)}
              </div>
            )}
          </CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
            <p className="text-sm font-medium">آیا این مقاله مفید بود؟</p>
            <div className="flex gap-2">
              <Button size="sm" variant={article.my_feedback === true ? "subtle" : "outline"} onClick={() => vote(true)}>
                <ThumbsUp className="h-4 w-4" /> بله ({formatNumber(article.helpful_count)})
              </Button>
              <Button size="sm" variant={article.my_feedback === false ? "subtle" : "outline"} onClick={() => vote(false)}>
                <ThumbsDown className="h-4 w-4" /> خیر ({formatNumber(article.not_helpful_count)})
              </Button>
            </div>
          </div>
        </Card>
        {ticketHref && (
          <div className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm">
            پاسخ خود را پیدا نکردید؟ <Link href={ticketHref} className="font-medium text-primary">یک تیکت ثبت کنید</Link>
          </div>
        )}
      </article>
      <aside>
        <Card className="lg:sticky lg:top-24">
          <CardHeader title="مقالات مرتبط" />
          {article.related.length === 0 ? (
            <p className="p-5 text-xs text-muted-foreground">مقاله مرتبطی یافت نشد.</p>
          ) : (
            <ul className="divide-y">
              {article.related.map((r) => (
                <li key={r.id}>
                  <Link href={`${basePath}/${r.slug}`} className={cn("block px-5 py-3 text-sm hover:bg-muted/40")}>{r.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
