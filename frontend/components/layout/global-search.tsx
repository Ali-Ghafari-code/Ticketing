"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, MessageSquare, Search, Ticket, User, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useUiStore } from "@/store/ui";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import type { SearchHit, SearchResponse } from "@/types";

const GROUPS: { key: keyof Omit<SearchResponse, "query">; label: string; icon: typeof Ticket }[] = [
  { key: "tickets", label: "تیکت‌ها", icon: Ticket },
  { key: "customers", label: "مشتریان", icon: User },
  { key: "agents", label: "کارشناسان", icon: UserCog },
  { key: "articles", label: "مقالات پایگاه دانش", icon: BookOpen },
  { key: "messages", label: "پیام‌ها", icon: MessageSquare },
];

export function SearchTrigger({ className }: { className?: string }) {
  const setOpen = useUiStore((s) => s.setSearchOpen);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);
  return (
    <button
      onClick={() => setOpen(true)}
      className={className ?? "flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"}
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-start">جستجو در تیکت‌ها، مشتریان، مقالات...</span>
      <kbd className="hidden rounded border bg-card px-1.5 text-[0.65rem] ltr sm:inline">Ctrl K</kbd>
    </button>
  );
}

export function GlobalSearch() {
  const { searchOpen, setSearchOpen } = useUiStore();
  const [q, setQ] = useState("");
  const debounced = useDebounce(q.trim(), 300);
  const router = useRouter();
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    enabled: searchOpen && debounced.length >= 2,
    queryFn: async () => (await api.get<SearchResponse>("/search", { params: { q: debounced } })).data,
  });

  const go = (hit: SearchHit) => {
    setSearchOpen(false);
    setQ("");
    router.push(hit.link);
  };
  const total = data ? GROUPS.reduce((n, g) => n + data[g.key].length, 0) : 0;

  return (
    <Modal open={searchOpen} onClose={() => setSearchOpen(false)} size="lg">
      <div className="-mx-5 -mt-4 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="شماره تیکت، موضوع، نام مشتری، متن پیام..."
            className="h-9 flex-1 bg-transparent text-sm outline-none"
            aria-label="جستجو"
          />
          {isFetching && <Spinner className="h-4 w-4" />}
        </div>
      </div>
      <div className="-mx-5 max-h-[60vh] overflow-y-auto px-2 py-2">
        {debounced.length < 2 && <p className="py-10 text-center text-xs text-muted-foreground">حداقل ۲ حرف وارد کنید</p>}
        {data && total === 0 && !isFetching && <p className="py-10 text-center text-xs text-muted-foreground">نتیجه‌ای یافت نشد</p>}
        {data &&
          GROUPS.filter((g) => data[g.key].length).map((g) => (
            <div key={g.key} className="mb-2">
              <p className="px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground">{g.label}</p>
              {data[g.key].map((hit) => (
                <button key={`${g.key}-${hit.id}`} onClick={() => go(hit)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-muted">
                  <g.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{hit.title}</span>
                    {hit.subtitle && <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>}
                  </span>
                  {typeof hit.meta?.status === "string" && (
                    <span className="rounded-md px-1.5 py-0.5 text-[0.7rem]" style={{ color: String(hit.meta.status_color), backgroundColor: `${hit.meta.status_color}1A` }}>
                      {hit.meta.status}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
      </div>
    </Modal>
  );
}
