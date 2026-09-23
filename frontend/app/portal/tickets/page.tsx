"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useTickets } from "@/features/tickets/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useUrlState } from "@/hooks/use-url-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { TicketTable } from "@/components/tickets/ticket-table";

const DEFAULTS = { view: "all", q: "", page: 1, page_size: 20, sort: "updated_at", direction: "desc" };

function Inner() {
  const [state, setState] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounce(search, 400);
  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const { data, isLoading } = useTickets({
    q: state.q || undefined,
    state: state.view === "all" ? undefined : state.view,
    page: state.page,
    page_size: state.page_size,
    sort: state.sort,
    direction: state.direction as "asc" | "desc",
  });
  return (
    <div>
      <PageHeader title="تیکت‌های من" actions={<Link href="/portal/tickets/new"><Button><Plus className="h-4 w-4" /> ثبت تیکت جدید</Button></Link>} />
      <Tabs
        className="mb-4"
        value={state.view}
        onChange={(view) => setState({ view })}
        items={[
          { value: "all", label: "همه" },
          { value: "open", label: "باز" },
          { value: "pending", label: "در انتظار پاسخ شما" },
          { value: "resolved", label: "حل شده" },
          { value: "closed", label: "بسته شده" },
        ]}
      />
      <TicketTable
        data={data?.items}
        loading={isLoading}
        basePath="/portal/tickets"
        visibleColumns={["code", "subject", "status", "priority", "department", "updated_at"]}
        sort={{ key: state.sort, direction: state.direction as "asc" | "desc" }}
        onSortChange={(s) => setState({ sort: s.key, direction: s.direction })}
        toolbar={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در موضوع یا شماره تیکت" icon={<Search className="h-4 w-4" />} className="h-9" />}
        empty={<EmptyState title="تیکتی یافت نشد" action={<Link href="/portal/tickets/new"><Button size="sm"><Plus className="h-4 w-4" /> ثبت تیکت</Button></Link>} />}
        footer={data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPageChange={(page) => setState({ page }, { resetPage: false })} />}
      />
    </div>
  );
}

export default function PortalTicketsPage() {
  return <Suspense><Inner /></Suspense>;
}
