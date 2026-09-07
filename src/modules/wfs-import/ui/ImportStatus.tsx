import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Building2, TreePine } from 'lucide-react';
import { WfsImportStatus } from '../store/useWfsStore';

interface ImportStatusProps {
  status: WfsImportStatus;
}

export const ImportStatus: React.FC<ImportStatusProps> = ({ status }) => {
  if (!status.isFetching && status.buildingsCount === 0 && status.treesCount === 0 && !status.error) {
    return null;
  }

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '6px',
        background: status.error
          ? 'rgba(239, 68, 68, 0.1)'
          : 'rgba(56, 189, 248, 0.08)',
        border: `1px solid ${status.error ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 189, 248, 0.2)'}`,
        fontSize: '11px',
      }}
    >
      {status.isFetching && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
          <Loader2 size={13} className="animate-spin" />
          <span>Pobieranie danych…</span>
        </div>
      )}

      {status.error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171' }}>
          <AlertCircle size={13} />
          <span>{status.error}</span>
        </div>
      )}

      {!status.isFetching && !status.error && (status.buildingsCount > 0 || status.treesCount > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80' }}>
            <CheckCircle2 size={13} />
            <span>Zaimportowano:</span>
          </div>
          {status.buildingsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: '#94a3b8' }}>
              <Building2 size={12} />
              <span>{status.buildingsCount} budynków</span>
            </div>
          )}
          {status.parcelsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: '#94a3b8' }}>
              <span>📐</span>
              <span>{status.parcelsCount} działek</span>
            </div>
          )}
          {status.treesCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: '#94a3b8' }}>
              <TreePine size={12} />
              <span>{status.treesCount} drzew</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
