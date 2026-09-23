"use client";
import { useState } from "react";
import { API_ORIGIN } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";

const palette = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316"];

function colorFor(name?: string | null) {
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

const sizes = { xs: "h-6 w-6 text-[0.6rem]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" };

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}

export function Avatar({ name, src, size = "sm", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const url = src && !failed ? (src.startsWith("http") ? src : `${API_ORIGIN}${src}`) : null;
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white", sizes[size], className)}
      style={{ backgroundColor: url ? undefined : colorFor(name) }}
      title={name ?? undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name ?? ""} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
