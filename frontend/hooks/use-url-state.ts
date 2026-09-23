"use client";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Keeps list filters in the URL so they survive reloads and can be shared. */
export function useUrlState<T extends Record<string, unknown>>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(() => {
    const out: Record<string, unknown> = { ...defaults };
    Object.entries(defaults).forEach(([key, def]) => {
      if (Array.isArray(def)) {
        const values = params.getAll(key);
        out[key] = values.length ? values : def;
      } else {
        const v = params.get(key);
        if (v === null) return;
        if (typeof def === "number") out[key] = Number(v) || def;
        else if (typeof def === "boolean") out[key] = v === "true";
        else out[key] = v;
      }
    });
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const setState = useCallback(
    (patch: Partial<T>, { resetPage = true }: { resetPage?: boolean } = {}) => {
      const next = { ...state, ...patch } as Record<string, unknown>;
      if (resetPage && !("page" in patch) && "page" in defaults) next.page = 1;
      const search = new URLSearchParams();
      Object.entries(next).forEach(([key, value]) => {
        const def = (defaults as Record<string, unknown>)[key];
        if (value === undefined || value === null || value === "" || value === def) return;
        if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
        else search.set(key, String(value));
      });
      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [state, defaults, router, pathname],
  );

  return [state, setState] as const;
}
