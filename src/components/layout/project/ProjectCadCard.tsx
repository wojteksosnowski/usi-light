import React from 'react';
import { Upload, Sliders, FileCode } from 'lucide-react';
import { DxfUnitOption } from '../../../utils/dxfParser';
import { useProjectIO } from './hooks/useProjectIO';
import { useProjectExport } from './hooks/useProjectExport';

const DXF_UNIT_OPTIONS: { id: DxfUnitOption; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Automatyczne wykrywanie jednostki z nagłówka $INSUNITS lub skali geometrii' },
  { id: 'm', label: 'm', description: 'Wymuś skalę: 1 jednostka DXF = 1 m' },
  { id: 'dm', label: 'dm', description: 'Wymuś skalę: 1 jednostka DXF = 1 dm' },
  { id: 'cm', label: 'cm', description: 'Wymuś skalę: 1 jednostka DXF = 1 cm' },
  { id: 'mm', label: 'mm', description: 'Wymuś skalę: 1 jednostka DXF = 1 mm' },
];

export const ProjectCadCard: React.FC = () => {
  const { dxfUnit, dxfImportInfo, handleFileUpload, handleDxfUnitChange } = useProjectIO();
  const {
    isPro,
    terrainExportBusy,
    exportWarning,
    handleExportDxf,
  } = useProjectExport();

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Pliki CAD</span>
        <Sliders size={14} color="var(--accent-indigo)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPro ? 'repeat(2, 1fr)' : '1fr',
            gap: '6px',
          }}
        >
          <label
            className="btn-tile active-indigo"
            style={{
              margin: 0,
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Wgraj plik DXF"
          >
            <Upload size={13} />
            <span>Wgraj DXF</span>
            <input type="file" accept=".dxf" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>

          {isPro && (
            <button
              type="button"
              onClick={handleExportDxf}
              disabled={terrainExportBusy}
              className="btn-tile active-cyan"
              style={{
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 6px',
                fontSize: '11px',
                fontWeight: 600,
                opacity: terrainExportBusy ? 0.6 : 1,
                cursor: terrainExportBusy ? 'not-allowed' : 'pointer',
              }}
              title="Eksportuj geometrię i punkty pomiarowe do formatu CAD DXF"
            >
              <FileCode size={13} />
              <span>{terrainExportBusy ? 'Eksportowanie…' : 'Eksport DXF'}</span>
            </button>
          )}
        </div>

        {exportWarning && (
          <div style={{ fontSize: '10.5px', color: 'var(--accent-amber)', textAlign: 'center', fontWeight: 600 }}>
            {exportWarning}
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Jednostka rysunku DXF:
        </div>

        <div
          className="project-grid-presets"
          style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
        >
          {DXF_UNIT_OPTIONS.map((tab) => {
            const isActive = dxfUnit === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleDxfUnitChange(tab.id)}
                className={`project-preset-btn ${isActive ? 'active-indigo' : ''}`}
                title={tab.description}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {dxfImportInfo ? (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '11px',
              color: 'var(--text-primary)',
              lineHeight: '1.4',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '2px',
              }}
            >
              <span>Skala importu:</span>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                {dxfImportInfo.unitName}
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {dxfImportInfo.source}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
            {dxfUnit === 'auto'
              ? 'Automatycznie odczytuje $INSUNITS z pliku DXF lub dopasowuje skalę (mm/cm/m).'
              : `Wymuszenie: 1 jednostka = ${
                  dxfUnit === 'm'
                    ? '1 metr (1.0)'
                    : dxfUnit === 'cm'
                    ? '1 centymetr (0.01 m)'
                    : '1 milimetr (0.001 m)'
                }.`}
          </div>
        )}
      </div>
    </div>
  );
};
