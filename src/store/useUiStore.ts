import { create } from 'zustand';

interface UiState {
  isSidebarOpen: boolean;
  openSidebarGroup: 'project' | 'layers' | 'tools' | null;
  copiedToast: string | null;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setOpenSidebarGroup: (group: 'project' | 'layers' | 'tools' | null) => void;
  toggleSidebarGroup: (group: 'project' | 'layers' | 'tools') => void;
  showCopiedToast: (msg: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  openSidebarGroup: 'project',
  copiedToast: null,

  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setOpenSidebarGroup: (group) => set({ openSidebarGroup: group }),
  toggleSidebarGroup: (group) =>
    set((state) => ({
      openSidebarGroup: state.openSidebarGroup === group ? null : group,
    })),

  showCopiedToast: (msg) => {
    set({ copiedToast: msg });
    setTimeout(() => {
      set((state) => (state.copiedToast === msg ? { copiedToast: null } : state));
    }, 2500);
  },
}));
