import React from 'react';
import { Crown } from 'lucide-react';
import { useLicenseStore, useUiStore } from '../../store';

export const ProBadge: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
  const daysLeft = useLicenseStore((s) => s.daysLeft);
  const setPricingModalOpen = useUiStore((s) => s.setPricingModalOpen);
  const setLicenseModalOpen = useUiStore((s) => s.setLicenseModalOpen);

  if (isPro) {
    return (
      <button
        type="button"
        onClick={() => setLicenseModalOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 8px',
          borderRadius: '999px',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.25))',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          color: '#fbbf24',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'all 0.2s ease',
        }}
        title={`Aktywna licencja PRO (${daysLeft !== null ? `${daysLeft} dni pozostało` : 'Aktywna'}). Kliknij, aby zarządzać.`}
      >
        <Crown size={12} color="#fbbf24" />
        <span>PRO{daysLeft !== null ? ` (${daysLeft}d)` : ''}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPricingModalOpen(true)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 9px',
        borderRadius: '999px',
        background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))',
        border: '1px solid rgba(99, 102, 241, 0.6)',
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
        letterSpacing: '0.02em',
        transition: 'all 0.2s ease',
      }}
      title="Rozszerz o import działek geodezyjnych i obrysów budynków oraz eksport DXF"
    >
      <span>Rozszerz</span>
    </button>
  );
};
