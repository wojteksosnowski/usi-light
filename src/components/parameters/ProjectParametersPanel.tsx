import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  Copy,
  Building,
  LandPlot,
  Layers,
  Check,
} from 'lucide-react';
import { useSceneStore, useUiStore } from '../../store';
import {
  computePolygonArea,
  computePolygonIntersectionWithBoundaries,
} from '@/utils/math2d';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';

interface ProjectParametersPanelProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export const ProjectParametersPanel: React.FC<ProjectParametersPanelProps> = React.memo(({
  onClose,
  isEmbedded = false,
  isCollapsed,
  onToggleCollapse,
}) => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);
  const copiedToast = useUiStore((s) => s.copiedToast);

  // Active building object
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = buildings.find((item) => item.id === selectedBuildingId);
    if (!b) return null;
    const lyr = b.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) return null;
    return b;
  }, [buildings, selectedBuildingId, layerSettings]);

  // Selected building area
  const selectedBuildingArea = useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.vertices || selectedBuilding.vertices.length < 3) return 0;
    return computePolygonArea(selectedBuilding.vertices);
  }, [selectedBuilding]);

  // Działki (boundary, wykluczając place zabaw)
  const boundaryObjects = useMemo(() => {
    return buildings.filter(
      (b) => b.category === 'boundary' && b.areaType !== 'playground' && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
    );
  }, [buildings]);

  // Działki z włączonym "W projekcie" (isTested) dla kalkulacji wskaźników
  const testedBoundaryObjects = useMemo(() => {
    return boundaryObjects.filter((b) => b.isTested);
  }, [boundaryObjects]);

  // Powierzchnia działek badanych (lub wszystkich jeśli żadna nie ma isTested)
  const activePlotBoundaries = useMemo(() => {
    return testedBoundaryObjects.length > 0 ? testedBoundaryObjects : boundaryObjects;
  }, [testedBoundaryObjects, boundaryObjects]);

  const totalBoundaryArea = useMemo(() => {
    return activePlotBoundaries.reduce((sum, b) => sum + computePolygonArea(b.vertices), 0);
  }, [activePlotBoundaries]);


  // Summary of tested buildings (Projektowane)
  const testedBuildingsSummary = useMemo(() => {
    const tested = buildings.filter(
      (b) => b.isTested && b.category !== 'boundary' && b.isIncluded !== false && b.vertices?.length >= 3
    );
    const count = tested.length;
    let totalPz = 0;
    let totalPc = 0;
    let totalVolume = 0;

    const hasTestedPlot = activePlotBoundaries.length > 0;

    for (const b of tested) {
      // Jeśli mamy działki, liczymy powierzchnię zabudowy z przecięcia z działką badaną
      const pz = hasTestedPlot
        ? computePolygonIntersectionWithBoundaries(b.vertices, activePlotBoundaries)
        : computePolygonArea(b.vertices);

      const n = b.storeysCount || (b.defaultHeight > (b.firstFloorHeight ?? 3.0)
        ? 1 + Math.max(1, Math.round((b.defaultHeight - (b.firstFloorHeight ?? 3.0)) / (b.typicalFloorHeight ?? 3.0)))
        : 1);
      const h = b.defaultHeight;
      totalPz += pz;
      totalPc += pz * n;
      totalVolume += pz * h;
    }

    // Domyślna sprawność nadziemia = 0.70 (do obliczania PUM z PC)
    const estimatedPUM = totalPc * 0.70;
    const plotCoverageRatio = totalBoundaryArea > 0 ? (totalPz / totalBoundaryArea) * 100 : 0;
    const intensityRatio = totalBoundaryArea > 0 ? totalPc / totalBoundaryArea : 0;

    return {
      count,
      totalPz,
      totalPc,
      totalVolume,
      estimatedPUM,
      plotCoverageRatio,
      intensityRatio,
    };
  }, [buildings, activePlotBoundaries, totalBoundaryArea]);

  const handleCopyToClipboard = () => {
    const lines: string[] = [
      '=== ZESTAWIENIE PARAMETRÓW PROJEKTU ===',
      `Projektowane budynki: ${testedBuildingsSummary.count}`,
      `Powierzchnia zabudowy (Pz): ${Math.round(testedBuildingsSummary.totalPz)} m²`,
      `Powierzchnia całkowita (Pc): ${Math.round(testedBuildingsSummary.totalPc)} m²`,
      `Kubatura brutto (V): ${Math.round(testedBuildingsSummary.totalVolume)} m³`,
      `Szacowany PUM (~70%): ${Math.round(testedBuildingsSummary.estimatedPUM)} m²`,
    ];

    if (totalBoundaryArea > 0) {
      lines.push(
        `Powierzchnia działki (Pdz): ${Math.round(totalBoundaryArea)} m²`,
        `Wskaźnik powierzchni zabudowy: ${testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%`,
        `Wskaźnik intensywności zabudowy: ${testedBuildingsSummary.intensityRatio.toFixed(2)}`
      );
    }

    if (selectedBuilding && selectedBuilding.category !== 'boundary') {
      const pz = selectedBuildingArea;
      const n = selectedBuilding.storeysCount || (selectedBuilding.defaultHeight > (selectedBuilding.firstFloorHeight ?? 3.0)
        ? 1 + Math.max(1, Math.round((selectedBuilding.defaultHeight - (selectedBuilding.firstFloorHeight ?? 3.0)) / (selectedBuilding.typicalFloorHeight ?? 3.0)))
        : 1);
      lines.push(
        '',
        `--- ZAZNACZONY OBIEKT: ${selectedBuilding.name} ---`,
        `Liczba kondygnacji: ${n}`,
        `Wysokość H: ${selectedBuilding.defaultHeight.toFixed(2)} m`,
        `Powierzchnia zabudowy: ${Math.round(pz)} m²`,
        `Powierzchnia całkowita: ${Math.round(pz * n)} m²`,
        `Kubatura brutto: ${Math.round(pz * selectedBuilding.defaultHeight)} m³`,
        `Szacowany PUM: ${Math.round(pz * n * 0.7)} m²`
      );
    }

    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        showCopiedToast('Skopiowano parametry projektu do schowka!');
      })
      .catch(() => {
        showCopiedToast('Nie udało się skopiować.');
      });
  };

  return (
    <FloatingInspectorCard
      title="Parametry projektu"
      subtitle={`${testedBuildingsSummary.count} bad. / ${boundaryObjects.length} działek`}
      icon={<FileSpreadsheet size={15} />}
      accentColor="emerald"
      badge={testedBuildingsSummary.count > 0 ? `${Math.round(testedBuildingsSummary.totalPz)} m² Pz` : undefined}
      onClose={onClose}
      isEmbedded={isEmbedded}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      collapsible={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
        {/* 1. Sekcja: Zaznaczony Obiekt */}
        {selectedBuilding && selectedBuilding.category !== 'boundary' && (() => {
          const pz = selectedBuildingArea;
          const n = selectedBuilding.storeysCount || (selectedBuilding.defaultHeight > (selectedBuilding.firstFloorHeight ?? 3.0)
            ? 1 + Math.max(1, Math.round((selectedBuilding.defaultHeight - (selectedBuilding.firstFloorHeight ?? 3.0)) / (selectedBuilding.typicalFloorHeight ?? 3.0)))
            : 1);
          const pc = pz * n;
          const vol = pz * selectedBuilding.defaultHeight;
          const pum = pc * 0.70;

          return (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Building size={12} color="var(--accent-indigo)" />
                  <span>{selectedBuilding.name}</span>
                </span>
                <span style={{ color: 'var(--accent-sky)', fontSize: '10.5px' }}>{n} kond. (H={selectedBuilding.defaultHeight.toFixed(1)}m)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia zabudowy (Pz):</span>
                <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(pz)} m²</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia całkowita (Pc):</span>
                <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{Math.round(pc)} m²</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Kubatura brutto (V):</span>
                <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{Math.round(vol)} m³</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Szacowany PUM (~70%):</span>
                <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(pum)} m²</b>
              </div>

            </div>
          );
        })()}

        {/* 2. Sekcja: Łącznie obiekty badane / projektowane */}
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '8px',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--accent-indigo)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Layers size={12} />
            <span>Łącznie obiekty badane ({testedBuildingsSummary.count} szt.)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. zabudowy (Pz):</span>
            <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPz)} m²</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. całkowita (Pc):</span>
            <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPc)} m²</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna kubatura (V):</span>
            <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalVolume)} m³</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączny szacowany PUM:</span>
            <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.estimatedPUM)} m²</b>
          </div>
        </div>

        {/* 3. Sekcja: Działki i wskaźniki urbanistyczne */}
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--accent-rose)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <LandPlot size={12} />
            <span>
              Działki ewidencyjne ({boundaryObjects.length} szt.
              {testedBoundaryObjects.length > 0 ? `, w tym ${testedBoundaryObjects.length} bad.` : ''})
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Pow. działki badanej (Pdz):</span>
            <b style={{ color: 'var(--accent-rose)', fontFamily: 'monospace' }}>
              {totalBoundaryArea > 0 ? `${Math.round(totalBoundaryArea)} m² (${(totalBoundaryArea / 100).toFixed(2)} a)` : 'Brak działek'}
            </b>
          </div>
          {totalBoundaryArea > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Wskaźnik pow. zabudowy:</span>
                <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Wskaźnik intensywności:</span>
                <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityRatio.toFixed(2)}</b>
              </div>
            </>
          )}
        </div>

        {/* 4. Przycisk Kopiuj do schowka */}
        <button
          type="button"
          onClick={handleCopyToClipboard}
          className="btn-tile active-indigo"
          style={{ justifyContent: 'center', gap: '6px', padding: '8px 10px', marginTop: '2px' }}
          title="Skopiuj zestawienie danych powierzchniowych i kubaturowych do schowka"
        >
          <Copy size={13} />
          <span style={{ fontWeight: 600 }}>Kopiuj do schowka</span>
        </button>

        {copiedToast && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--accent-emerald)',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              padding: '5px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <Check size={12} />
            <span>{copiedToast}</span>
          </div>
        )}
      </div>
    </FloatingInspectorCard>
  );
});

ProjectParametersPanel.displayName = 'ProjectParametersPanel';
