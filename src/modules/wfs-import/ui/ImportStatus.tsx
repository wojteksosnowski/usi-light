import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Building2, TreePine, Info } from 'lucide-react';
import { WfsImportStatus } from '../store/useWfsStore';

interface ImportStatusProps {
  status: WfsImportStatus;
}

export const ImportStatus: React.FC<ImportStatusProps> = ({ status }) => {
  if (!status.isFetching && status.buildingsCount === 0 && status.treesCount === 0 && !status.error && !status.info) {
    return null;
  }

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '6px',
        background: status.error
          ? 'rgba(244, 63, 94, 0.1)'
          : status.info
          ? 'rgba(59, 130, 246, 0.08)'
          : 'rgba(59, 130, 246, 0.08)',
        border: `1px solid ${status.error ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)'}`,
        fontSize: '11px',
      }}
    >
      {status.isFetching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-blue)' }}>
          <Loader2 size={13} className="animate-spin" />
          <span>Pobieranie danych…</span>
        </div>
      )}

      {status.error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose)' }}>
          <AlertCircle size={13} />
          <span>{status.error}</span>
        </div>
      )}

      {status.info && !status.error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-blue)' }}>
          <Info size={13} />
          <span>{status.info}</span>
        </div>
      )}

      {!status.isFetching && !status.error && (status.buildingsCount > 0 || status.treesCount > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-emerald)' }}>
            <CheckCircle2 size={13} />
            <span>Zaimportowano:</span>
          </div>
          {status.buildingsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: 'var(--text-secondary)' }}>
              <Building2 size={12} />
              <span>{status.buildingsCount} budynków</span>
            </div>
          )}
          {status.parcelsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: 'var(--text-secondary)' }}>
              <span>📐</span>
              <span>{status.parcelsCount} działek</span>
            </div>
          )}
          {status.treesCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: 'var(--text-secondary)' }}>
              <TreePine size={12} />
              <span>{status.treesCount} drzew</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
