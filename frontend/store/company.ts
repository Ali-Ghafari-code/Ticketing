import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CompanyContextState {
  /** Company a super admin is currently operating on (sent as X-Company-Id). */
  selectedCompanyId: string | null;
  selectedCompanyName: string | null;
  select: (id: string | null, name?: string | null) => void;
}

export const useCompanyContext = create<CompanyContextState>()(
  persist(
    (set) => ({
      selectedCompanyId: null,
      selectedCompanyName: null,
      select: (id, name = null) => set({ selectedCompanyId: id, selectedCompanyName: name }),
    }),
    { name: "helpdesk.company-context" },
  ),
);
