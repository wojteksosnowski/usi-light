import { create } from 'zustand';
import { useWfsStore } from '../modules/wfs-import/store/useWfsStore';

export type ActiveModalType = 'share' | 'pricing' | 'license' | 'paymentSuccess' | 'confirmDelete' | null;

export type SidebarGroupType = 'project' | 'analyses' | 'layers' | 'tools';

export type ViewportMode2D = 'cad' | 'masterplan_white';

const syncInvertColorsWithViewMode = (mode: ViewportMode2D) => {
  const isCad = mode === 'cad';
  const wfs = useWfsStore.getState();
  wfs.setGeoOverlayInvertColors(isCad);
  wfs.setMpzpInvertColors(isCad);
};

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
  viewportScale: number;
  viewMode2D: ViewportMode2D;
  /** Id modyfikatora aktualnie rozwiniętego (akordeon) w panelu Modyfikatorów - podgląd 3D
   * podświetla krawędź odpowiadającą temu modyfikatorowi, nie pierwszemu z listy. */
  expandedModifierId: string | null;

  /** Wskaźnik zapisu projektu na HUD topbar */
  isDirty: boolean;
  lastSavedAt: number | null;
  saveError: boolean;
  markDirty: () => void;
  markSaved: (timestamp: number) => void;
  markSaveError: () => void;

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
  setViewportScale: (scale: number) => void;
  setViewMode2D: (mode: ViewportMode2D) => void;
  toggleViewMode2D: () => void;
  setExpandedModifierId: (id: string | null) => void;
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
  viewportScale: 14,
  viewMode2D: 'cad',
  expandedModifierId: null,

  isDirty: false,
  lastSavedAt: null,
  saveError: false,
  markDirty: () => set({ isDirty: true, saveError: false }),
  markSaved: (timestamp) => set({ isDirty: false, lastSavedAt: timestamp, saveError: false }),
  markSaveError: () => set({ isDirty: false, saveError: true }),

  setViewMode2D: (mode) => {
    set({ viewMode2D: mode });
    syncInvertColorsWithViewMode(mode);
  },
  toggleViewMode2D: () =>
    set((state) => {
      const nextMode = state.viewMode2D === 'cad' ? 'masterplan_white' : 'cad';
      syncInvertColorsWithViewMode(nextMode);
      return {
        viewMode2D: nextMode,
      };
    }),

  setExpandedModifierId: (id) => set({ expandedModifierId: id }),

  setViewportScale: (scale) => set((state) => (Math.abs(state.viewportScale - scale) > 1e-4 ? { viewportScale: scale } : state)),

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
