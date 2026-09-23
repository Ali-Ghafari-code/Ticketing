"use client";
import { use } from "react";
import { ArticleView } from "@/components/kb/article-view";

export default function PortalArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <ArticleView slug={decodeURIComponent(slug)} basePath="/portal/kb" ticketHref="/portal/tickets/new" />;
}
