"use client";
import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscape, useLockBody } from "./modal";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "start" | "end";
  width?: string;
}

/** Slide-over panel. In RTL "start" is the right edge. */
export function Drawer({ open, onClose, title, children, footer, side = "end", width = "max-w-md" }: DrawerProps) {
  useLockBody(open);
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 flex w-full flex-col border-border bg-card shadow-pop",
          width,
          side === "start" ? "right-0 border-l" : "left-0 border-r",
        )}
        style={{ animation: `${side === "start" ? "drawer-in-right" : "drawer-in-left"} .2s ease-out` }}
      >
        <style>{`@keyframes drawer-in-right{from{transform:translateX(100%)}to{transform:none}}@keyframes drawer-in-left{from{transform:translateX(-100%)}to{transform:none}}`}</style>
        {title !== undefined && (
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="بستن">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
