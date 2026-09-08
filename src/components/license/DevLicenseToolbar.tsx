import React from 'react';
import { Crown, Sparkles, Wrench, RefreshCw } from 'lucide-react';
import { useLicenseStore, useUiStore } from '../../store';

export const DevLicenseToolbar: React.FC = () => {
  // Komponent renderuje się TYLKO w trybie deweloperskim (npm run dev)
  if (!import.meta.env.DEV) return null;

  const isPro = useLicenseStore((s) => s.isPro);
  const activateLicense = useLicenseStore((s) => s.activateLicense);
  const clearLicense = useLicenseStore((s) => s.clearLicense);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);

  const handleToggleDevPro = async () => {
    if (isPro) {
      clearLicense();
      showCopiedToast('🛠️ DEV: Przełączono na wersję FREE (Darmową)');
    } else {
      await activateLicense('USI-DEV-MASTER-PRO');
      showCopiedToast('👑 DEV: Aktywowano Master PRO (Nielimitowany)');
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '64px',
        left: '16px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: 'rgba(2, 6, 23, 0.92)',
        border: `1px solid ${isPro ? 'rgba(245, 158, 11, 0.6)' : 'rgba(99, 102, 241, 0.5)'}`,
        backdropFilter: 'blur(12px)',
        borderRadius: '999px',
        padding: '4px 8px 4px 10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        fontSize: '11px',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Wrench size={12} color="#94a3b8" />
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>DEV:</span>
        <span
          style={{
            color: isPro ? '#fbbf24' : '#a5b4fc',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          {isPro ? (
            <>
              <Crown size={12} color="#fbbf24" />
              <span>PRO (Active)</span>
            </>
          ) : (
            <>
              <Sparkles size={12} color="#a5b4fc" />
              <span>FREE Mode</span>
            </>
          )}
        </span>
      </div>

      <button
        type="button"
        onClick={handleToggleDevPro}
        style={{
          marginLeft: '4px',
          padding: '3px 8px',
          borderRadius: '999px',
          border: 'none',
          backgroundColor: isPro ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.25)',
          color: isPro ? '#fca5a5' : '#6ee7b7',
          fontWeight: 700,
          fontSize: '10px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
        title={
          isPro
            ? 'Przełącz na wersję darmową (aby przetestować blokady i modale zakupu)'
            : 'Przełącz na wersję PRO (rozszerz o import geo i eksport DXF)'
        }
      >
        <RefreshCw size={10} />
        <span>{isPro ? 'Zmień na FREE' : 'Włącz PRO'}</span>
      </button>
    </div>
  );
};
