import React from 'react';
import { useUiStore } from '../../store';
import { ShareProjectModal } from './ShareProjectModal';
import { PricingModal } from '../license/PricingModal';
import { LicenseManagementModal } from '../license/LicenseManagementModal';
import { PaymentSuccessModal } from '../license/PaymentSuccessModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { DxfImportModal } from '../dxf/DxfImportModal';

export const ModalRoot: React.FC = () => {
  const isShareModalOpen = useUiStore((s) => s.isShareModalOpen);
  const closeModal = useUiStore((s) => s.closeModal);
  const setShareModalOpen = useUiStore((s) => s.setShareModalOpen);

  return (
    <>
      <ShareProjectModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          closeModal();
        }}
      />
      <PricingModal />
      <LicenseManagementModal />
      <PaymentSuccessModal />
      <ConfirmDeleteModal />
      <DxfImportModal />
    </>
  );
};
