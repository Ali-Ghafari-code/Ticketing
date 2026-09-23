"use client";
import { useState } from "react";
import { create } from "zustand";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
}

interface ConfirmState {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  close: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  options: null,
  resolve: null,
  open: (options) => new Promise<boolean>((resolve) => set({ options, resolve })),
  close: (value) => {
    get().resolve?.(value);
    set({ options: null, resolve: null });
  },
}));

/** Promise-based confirmation: `if (await confirm({ title: "..." })) { ... }` */
export function useConfirm() {
  return useConfirmStore((s) => s.open);
}

export function ConfirmHost() {
  const { options, close } = useConfirmStore();
  const [busy] = useState(false);
  if (!options) return null;
  const danger = (options.tone ?? "danger") === "danger";
  return (
    <Modal
      open
      onClose={() => close(false)}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            {options.cancelText ?? "انصراف"}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={() => close(true)} autoFocus>
            {options.confirmText ?? "تایید"}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 py-2">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold">{options.title}</h3>
          {options.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{options.description}</p>}
        </div>
      </div>
    </Modal>
  );
}
