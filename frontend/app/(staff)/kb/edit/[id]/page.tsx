"use client";
import { use } from "react";
import { ArticleEditor } from "@/components/kb/article-editor";

export default function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ArticleEditor id={id} />;
}
