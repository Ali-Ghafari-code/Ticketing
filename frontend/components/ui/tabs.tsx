"use client";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[];
  className?: string;
  variant?: "underline" | "pill";
}

export function Tabs<T extends string>({ value, onChange, items, className, variant = "underline" }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "scrollbar-thin flex gap-1 overflow-x-auto",
        variant === "underline" ? "border-b" : "rounded-lg bg-muted p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors",
              variant === "underline"
                ? cn("-mb-px border-b-2 px-3 py-2.5", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
                : cn("rounded-md px-3 py-1.5", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"),
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[0.7rem]", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {item.count.toLocaleString("fa-IR")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
