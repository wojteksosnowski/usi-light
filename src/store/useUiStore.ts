import { create } from 'zustand';

interface UiState {
  isSidebarOpen: boolean;
  openSidebarGroup: 'project' | 'layers' | 'tools' | null;
  copiedToast: string | null;
  isShareModalOpen: boolean;
  isPricingModalOpen: boolean;
  isLicenseModalOpen: boolean;
  isPaymentSuccessModalOpen: boolean;
  paymentSuccessSessionId: string | null;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setOpenSidebarGroup: (group: 'project' | 'layers' | 'tools' | null) => void;
  toggleSidebarGroup: (group: 'project' | 'layers' | 'tools') => void;
  showCopiedToast: (msg: string) => void;
  setShareModalOpen: (open: boolean) => void;
  setPricingModalOpen: (open: boolean) => void;
  setLicenseModalOpen: (open: boolean) => void;
  setPaymentSuccessModalOpen: (open: boolean) => void;
  setPaymentSuccessSessionId: (sessionId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  openSidebarGroup: 'project',
  copiedToast: null,
  isShareModalOpen: false,
  isPricingModalOpen: false,
  isLicenseModalOpen: false,
  isPaymentSuccessModalOpen: false,
  paymentSuccessSessionId: null,

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

  setShareModalOpen: (open) => set({ isShareModalOpen: open }),
  setPricingModalOpen: (open) => set({ isPricingModalOpen: open }),
  setLicenseModalOpen: (open) => set({ isLicenseModalOpen: open }),
  setPaymentSuccessModalOpen: (open) => set({ isPaymentSuccessModalOpen: open }),
  setPaymentSuccessSessionId: (sessionId) => set({ paymentSuccessSessionId: sessionId }),
}));
