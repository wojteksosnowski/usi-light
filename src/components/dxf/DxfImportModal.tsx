import React, { useEffect } from 'react';
import { FileCode, Globe, Layers, AlertTriangle, CheckCircle2, Info, ArrowRight, Plus, RefreshCw, X } from 'lucide-react';
import { useUiStore } from '../../store';
import { DxfParseResult } from '../../utils/dxfParser';
import { GeoCompatibilityResult } from '../../utils/geoTransform';

export interface DxfImportModalPayload {
  fileName: string;
  parsedResult: DxfParseResult;
  geoCompatibility: GeoCompatibilityResult;
  onMerge: () => void;
  onReplace: () => void;
}

export const DxfImportModal: React.FC = () => {
  const isDxfImportModalOpen = useUiStore((s) => s.isDxfImportModalOpen);
  const modalPayload = useUiStore((s) => s.modalPayload) as DxfImportModalPayload | null;
  const closeModal = useUiStore((s) => s.closeModal);

  useEffect(() => {
    if (!isDxfImportModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDxfImportModalOpen, closeModal]);

  if (!isDxfImportModalOpen || !modalPayload) return null;

  const { fileName, parsedResult, geoCompatibility, onMerge, onReplace } = modalPayload;
  const { report, unitInfo, crs } = parsedResult;

  const widthMeters = Math.round(report.geoContext.bounds2D.maxX - report.geoContext.bounds2D.minX);
  const heightMeters = Math.round(report.geoContext.bounds2D.maxY - report.geoContext.bounds2D.minY);

  const getStatusColor = () => {
    switch (geoCompatibility.warningLevel) {
      case 'none':
        return {
          bg: 'rgba(34, 197, 94, 0.12)',
          border: 'rgba(34, 197, 94, 0.35)',
          text: 'var(--accent-emerald)',
          icon: <CheckCircle2 size={18} color="var(--accent-emerald)" />,
        };
      case 'info':
        return {
          bg: 'rgba(99, 102, 241, 0.12)',
          border: 'rgba(99, 102, 241, 0.35)',
          text: 'var(--accent-indigo)',
          icon: <Info size={18} color="var(--accent-indigo)" />,
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.35)',
          text: 'var(--accent-amber)',
          icon: <AlertTriangle size={18} color="var(--accent-amber)" />,
        };
      case 'error':
      default:
        return {
          bg: 'rgba(244, 63, 94, 0.12)',
          border: 'rgba(244, 63, 94, 0.35)',
          text: 'var(--accent-rose)',
          icon: <AlertTriangle size={18} color="var(--accent-rose)" />,
        };
    }
  };

  const statusStyle = getStatusColor();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
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
          maxWidth: '520px',
          backgroundColor: 'var(--bg-glass-modal)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '22px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.75)',
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
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-indigo)',
              }}
            >
              <FileCode size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Import pliku DXF
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {fileName || 'Rysunek CAD DXF'}
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

        {/* File Inspection Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={12} />
              <span>Układ odniesienia (CRS):</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-cyan)' }}>
              {crs?.geodeticLabel || 'LOKALNY CAD'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {crs?.description || 'Współrzędne lokalne'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Layers size={12} />
              <span>Wykryta geometria:</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {report.buildingCount} budynków, {report.boundaryCount} działek
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              Rozmiar: ~{widthMeters} m × {heightMeters} m ({unitInfo.unitName})
            </div>
          </div>
        </div>

        {/* Geographic Compatibility Status Alert */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: statusStyle.bg,
            border: `1px solid ${statusStyle.border}`,
            fontSize: '11.5px',
            lineHeight: '1.45',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ marginTop: '2px', flexShrink: 0 }}>
            {statusStyle.icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: statusStyle.text, marginBottom: '3px' }}>
              {geoCompatibility.isCompatible ? 'Zgodność geograficzna' : 'Informacja o lokalizacji'}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {geoCompatibility.description}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                onMerge();
                closeModal();
              }}
              className="btn-tile active-indigo"
              style={{
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Dołącza nowe obiekty do istniejącej sceny bez usuwania obecnych budynków"
            >
              <Plus size={14} />
              <span>Dołącz do sceny</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onReplace();
                closeModal();
              }}
              className="btn-tile active-cyan"
              style={{
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Zastępuje obecne obiekty sceny geometrią z pliku DXF"
            >
              <RefreshCw size={14} />
              <span>Zastąp scenę</span>
            </button>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="btn-secondary"
            style={{
              padding: '8px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              justifyContent: 'center',
            }}
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
};
