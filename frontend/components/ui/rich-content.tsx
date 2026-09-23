import { cn } from "@/lib/utils";

/** Renders server-sanitised HTML (the backend whitelists tags/attributes with nh3). */
export function RichContent({ html, className }: { html: string; className?: string }) {
  return <div className={cn("prose-content", className)} dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
