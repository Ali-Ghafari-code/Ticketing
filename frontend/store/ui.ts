import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;
  searchOpen: boolean;
  setMobileNav: (open: boolean) => void;
  toggleSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mobileNavOpen: false,
      sidebarCollapsed: false,
      searchOpen: false,
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    { name: "helpdesk.ui", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
