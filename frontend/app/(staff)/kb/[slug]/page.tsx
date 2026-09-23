"use client";
import { use } from "react";
import { useArticle } from "@/features/kb/api";
import { usePermission } from "@/hooks/use-permission";
import { ArticleView } from "@/components/kb/article-view";

export default function StaffArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const decoded = decodeURIComponent(slug);
  const { can } = usePermission();
  const { data } = useArticle(decoded);
  return <ArticleView slug={decoded} basePath="/kb" editHref={can("kb.manage") && data ? `/kb/edit/${data.id}` : undefined} />;
}
