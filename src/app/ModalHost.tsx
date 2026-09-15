import React, { Suspense, lazy } from 'react';
import { useUiStore } from '@/store';

const ShareProjectModal = lazy(() =>
  import('@/components/common/ShareProjectModal').then((m) => ({ default: m.ShareProjectModal }))
);
const PricingModal = lazy(() =>
  import('@/components/license/PricingModal').then((m) => ({ default: m.PricingModal }))
);
const LicenseManagementModal = lazy(() =>
  import('@/components/license/LicenseManagementModal').then((m) => ({ default: m.LicenseManagementModal }))
);
const PaymentSuccessModal = lazy(() =>
  import('@/components/license/PaymentSuccessModal').then((m) => ({ default: m.PaymentSuccessModal }))
);
const ConfirmDeleteModal = lazy(() =>
  import('@/components/common/ConfirmDeleteModal').then((m) => ({ default: m.ConfirmDeleteModal }))
);

export const ModalHost: React.FC = () => {
  const isShareModalOpen = useUiStore((s) => s.isShareModalOpen);
  const isPricingModalOpen = useUiStore((s) => s.isPricingModalOpen);
  const isLicenseModalOpen = useUiStore((s) => s.isLicenseModalOpen);
  const isPaymentSuccessModalOpen = useUiStore((s) => s.isPaymentSuccessModalOpen);
  const isConfirmDeleteModalOpen = useUiStore((s) => s.isConfirmDeleteModalOpen);
  const closeModal = useUiStore((s) => s.closeModal);
  const setShareModalOpen = useUiStore((s) => s.setShareModalOpen);

  const hasAnyModalOpen =
    isShareModalOpen ||
    isPricingModalOpen ||
    isLicenseModalOpen ||
    isPaymentSuccessModalOpen ||
    isConfirmDeleteModalOpen;

  if (!hasAnyModalOpen) return null;

  return (
    <Suspense
      fallback={
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(2, 6, 23, 0.4)',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        />
      }
    >
      {isShareModalOpen && (
        <ShareProjectModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            closeModal();
          }}
        />
      )}
      {isPricingModalOpen && <PricingModal />}
      {isLicenseModalOpen && <LicenseManagementModal />}
      {isPaymentSuccessModalOpen && <PaymentSuccessModal />}
      {isConfirmDeleteModalOpen && <ConfirmDeleteModal />}
    </Suspense>
  );
};
