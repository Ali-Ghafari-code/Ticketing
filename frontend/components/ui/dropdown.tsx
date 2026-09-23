"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";

export interface DropdownItem {
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  hidden?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  header?: ReactNode;
  className?: string;
}

export function Dropdown({ trigger, items, align = "end", header, className }: DropdownProps) {
  return (
    <Popover
      align={align}
      className={className}
      trigger={({ toggle, open }) => (
        <span onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="inline-flex">
          {trigger}
        </span>
      )}
    >
      {(close) => (
        <div role="menu">
          {header}
          {items
            .filter((i) => !i.hidden)
            .map((item, idx) =>
              item.divider ? (
                <div key={idx} className="my-1 border-t" />
              ) : item.href ? (
                <Link
                  key={idx}
                  href={item.href}
                  role="menuitem"
                  onClick={close}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  key={idx}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onClick?.();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted disabled:opacity-50",
                    item.danger && "text-danger hover:bg-danger/10",
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
        </div>
      )}
    </Popover>
  );
}
