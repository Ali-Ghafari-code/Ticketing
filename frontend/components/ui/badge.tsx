import { type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
} as const;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof tones;
  color?: string;
  dot?: boolean;
  size?: "sm" | "md";
}

export function Badge({ tone = "neutral", color, dot, size = "md", className, style, children, ...props }: BadgeProps) {
  const custom: CSSProperties | undefined = color
    ? { backgroundColor: `${color}1A`, color, ...style }
    : style;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[0.7rem]" : "px-2 py-0.5 text-xs",
        !color && tones[tone],
        className,
      )}
      style={custom}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}
