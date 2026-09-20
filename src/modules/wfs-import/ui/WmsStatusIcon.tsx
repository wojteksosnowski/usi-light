import React from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { WmsLayerStatus } from '../renderers/wmsTileManager';

/** Ikona statusu pobierania usługi WMS (spinner/wykrzyknik/checkmark) do wyświetlenia obok
 * nazwy usługi w sidebarze — patrz `ImportStatus.tsx` dla wzorca kolorystycznego. */
export const WmsStatusIcon: React.FC<{ status: WmsLayerStatus }> = ({ status }) => {
  if (status === 'loading') {
    return <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />;
  }
  if (status === 'error') {
    return <AlertCircle size={12} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />;
  }
  if (status === 'ready') {
    return <CheckCircle2 size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />;
  }
  return null;
};
