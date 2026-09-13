import { create } from 'zustand';

export type ActiveModalType = 'share' | 'pricing' | 'license' | 'paymentSuccess' | 'confirmDelete' | null;

export type SidebarGroupType = 'project' | 'analyses' | 'layers' | 'tools';

interface UiState {
  isSidebarOpen: boolean;
  openSidebarGroup: SidebarGroupType | null;
  copiedToast: string | null;
  activeModal: ActiveModalType;
  modalPayload?: Record<string, unknown> | null;
  isShareModalOpen: boolean;
  isPricingModalOpen: boolean;
  isLicenseModalOpen: boolean;
  isPaymentSuccessModalOpen: boolean;
  isConfirmDeleteModalOpen: boolean;
  paymentSuccessSessionId: string | null;

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setOpenSidebarGroup: (group: SidebarGroupType | null) => void;
  toggleSidebarGroup: (group: SidebarGroupType) => void;
  showCopiedToast: (msg: string) => void;
  openModal: (modal: ActiveModalType, payload?: Record<string, unknown> | null) => void;
  closeModal: () => void;
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
  activeModal: null,
  modalPayload: null,
  isShareModalOpen: false,
  isPricingModalOpen: false,
  isLicenseModalOpen: false,
  isPaymentSuccessModalOpen: false,
  isConfirmDeleteModalOpen: false,
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

  openModal: (modal, payload = null) =>
    set({
      activeModal: modal,
      modalPayload: payload,
      isShareModalOpen: modal === 'share',
      isPricingModalOpen: modal === 'pricing',
      isLicenseModalOpen: modal === 'license',
      isPaymentSuccessModalOpen: modal === 'paymentSuccess',
      isConfirmDeleteModalOpen: modal === 'confirmDelete',
    }),

  closeModal: () =>
    set({
      activeModal: null,
      modalPayload: null,
      isShareModalOpen: false,
      isPricingModalOpen: false,
      isLicenseModalOpen: false,
      isPaymentSuccessModalOpen: false,
      isConfirmDeleteModalOpen: false,
    }),

  setShareModalOpen: (open) =>
    set({
      isShareModalOpen: open,
      activeModal: open ? 'share' : null,
    }),
  setPricingModalOpen: (open) =>
    set({
      isPricingModalOpen: open,
      activeModal: open ? 'pricing' : null,
    }),
  setLicenseModalOpen: (open) =>
    set({
      isLicenseModalOpen: open,
      activeModal: open ? 'license' : null,
    }),
  setPaymentSuccessModalOpen: (open) =>
    set({
      isPaymentSuccessModalOpen: open,
      activeModal: open ? 'paymentSuccess' : null,
    }),
  setPaymentSuccessSessionId: (sessionId) => set({ paymentSuccessSessionId: sessionId }),
}));
