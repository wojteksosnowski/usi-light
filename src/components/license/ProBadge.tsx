import React from 'react';
import { Crown } from 'lucide-react';
import { useLicenseStore, useUiStore } from '../../store';

export const ProBadge: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
  const daysLeft = useLicenseStore((s) => s.daysLeft);
  const setPricingModalOpen = useUiStore((s) => s.setPricingModalOpen);

  if (isPro) {
    return (
      <button
        type="button"
        onClick={() => setPricingModalOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 8px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, var(--status-amber-bg), rgba(234, 88, 12, 0.25))',
          border: '1px solid var(--status-amber-border)',
          color: 'var(--status-amber-text)',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'all 0.2s ease',
        }}
        title={`Aktywna licencja PRO (${daysLeft !== null ? `${daysLeft} dni pozostało` : 'Aktywna'}). Kliknij, aby zarządzać.`}
      >
        <Crown size={12} color="var(--accent-amber)" />
        <span>PRO{daysLeft !== null ? ` (${daysLeft}d)` : ''}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-gold"
      onClick={() => setPricingModalOpen(true)}
      title="Rozszerz o import działek geodezyjnych i obrysów budynków oraz eksport DXF"
    >
      <span>Rozszerz</span>
    </button>
  );
};

