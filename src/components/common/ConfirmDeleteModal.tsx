import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useUiStore } from '../../store';

export interface ConfirmDeletePayload {
  projectId: string;
  projectName: string;
  onConfirm: (projectId: string) => void;
}

export const ConfirmDeleteModal: React.FC = () => {
  const isConfirmDeleteModalOpen = useUiStore((s) => s.isConfirmDeleteModalOpen);
  const modalPayload = useUiStore((s) => s.modalPayload) as ConfirmDeletePayload | null;
  const closeModal = useUiStore((s) => s.closeModal);

  useEffect(() => {
    if (!isConfirmDeleteModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmDeleteModalOpen, closeModal]);

  if (!isConfirmDeleteModalOpen || !modalPayload) return null;

  const handleConfirm = () => {
    modalPayload.onConfirm(modalPayload.projectId);
    closeModal();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'rgba(11, 19, 41, 0.98)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(244, 63, 94, 0.35)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-rose)',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Usuń projekt
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Potwierdzenie usunięcia z pamięci przeglądarki
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            fontSize: '12.5px',
            lineHeight: '1.5',
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '12px 14px',
          }}
        >
          Czy na pewno chcesz bezpowrotnie usunąć projekt{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            „{modalPayload.projectName}”
          </strong>{' '}
          z pamięci podręcznej tego urządzenia?
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button
            type="button"
            onClick={closeModal}
            className="btn-secondary"
            style={{
              padding: '9px 14px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(244, 63, 94, 0.5)',
              backgroundColor: 'rgba(244, 63, 94, 0.2)',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.35)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(244, 63, 94, 0.2)';
              e.currentTarget.style.color = '#fca5a5';
            }}
          >
            <Trash2 size={13} />
            <span>Usuń projekt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
