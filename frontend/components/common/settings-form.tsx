"use client";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSupportSettings, useUpdateSupportSettings, type SupportSettings } from "@/features/settings/api";
import { usePermission } from "@/hooks/use-permission";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";

/** Loads company support settings into local draft state and saves only changed keys. */
export function SupportSettingsEditor({ children }: { children: (draft: SupportSettings, set: (patch: Partial<SupportSettings>) => void) => ReactNode }) {
  const { data, isLoading } = useSupportSettings();
  const update = useUpdateSupportSettings();
  const { can } = usePermission();
  const [draft, setDraft] = useState<SupportSettings | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  if (isLoading || !draft) return <PageLoader />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data?.[k])));
  return (
    <div className="space-y-6">
      {children(draft, (patch) => setDraft((d) => ({ ...(d as SupportSettings), ...patch })))}
      {can("settings.update") && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="flex gap-2 rounded-xl border bg-card/95 p-2 shadow-pop backdrop-blur">
            <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(data ?? null)}>بازنشانی</Button>
            <Button disabled={!dirty} loading={update.isPending} onClick={() => update.mutate(changed, { onSuccess: () => toast.success("تنظیمات ذخیره شد"), onError: (e) => toast.error(getErrorMessage(e)) })}>
              ذخیره تغییرات
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
