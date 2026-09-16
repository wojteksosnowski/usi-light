import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  Copy,
  Building,
  LandPlot,
  Layers,
  Check,
  Link2,
  Car,
  TreePine,
} from 'lucide-react';
import { useSceneStore, useUiStore, useCadToolStore } from '../../store';
import { useStableWhileInteracting } from '@/hooks/useStableWhileInteracting';
import { computePolygonArea } from '@/utils/math2d';
import {
  calculateSingleBuildingMetrics,
  calculateProjectTotals,
  SingleBuildingMetrics,
  ProjectParametersResult,
} from '@/utils/projectParameters';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';

interface ProjectParametersPanelProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

const formatPct = (val: number, total: number) => `${((val / total) * 100).toFixed(1)}%`;

const StatRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  color?: string;
  isHeader?: boolean;
  isDashedTop?: boolean;
}> = ({ label, value, color = 'var(--text-secondary)', isHeader, isDashedTop }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      ...(isDashedTop ? { paddingTop: '2px', borderTop: '1px dashed rgba(255, 255, 255, 0.12)' } : {}),
    }}
  >
    <span style={{ color: isHeader ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isHeader ? 600 : 400 }}>
      {label}
    </span>
    <b style={{ color, fontFamily: 'monospace' }}>{value}</b>
  </div>
);

const MetricsGroup: React.FC<{
  pz: number;
  pc: number;
  pcNadz?: number;
  pcPodz?: number;
  volume: number;
  pum: number;
  pu: number;
  pumiu: number;
  parkingPlaces?: number;
  type?: 'residential' | 'service' | 'garage' | 'all';
}> = ({ pz, pc, pcNadz, pcPodz, volume, pum, pu, pumiu, parkingPlaces = 0, type = 'all' }) => (
  <>
    <StatRow label="Powierzchnia zabudowy (Pz):" value={`${Math.round(pz)} m²`} color="var(--accent-emerald)" />
    <StatRow
      label="Powierzchnia całkowita (Pc):"
      value={
        <>
          {Math.round(pc)} m²
          {pcPodz !== undefined && pcNadz !== undefined && pcPodz > 0 && (
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '4px' }}>
              (nadz: {Math.round(pcNadz)}, podz: {Math.round(pcPodz)})
            </span>
          )}
        </>
      }
      color="var(--accent-sky)"
    />
    <StatRow label="Kubatura brutto (V):" value={`${Math.round(volume)} m³`} color="var(--accent-purple, #c084fc)" />

    {(type === 'all' || type === 'residential') && pum > 0 && (
      <StatRow label="PUM (~70% mieszk.):" value={`${Math.round(pum)} m²`} color="var(--accent-amber)" />
    )}
    {(type === 'all' || type === 'service') && pu > 0 && (
      <StatRow label="PU (~70% usług.):" value={`${Math.round(pu)} m²`} color="var(--accent-amber)" />
    )}
    {type !== 'garage' && (pum > 0 || pu > 0 || type === 'all') && (
      <StatRow label="Łącznie PUMiU:" value={`${Math.round(pumiu)} m²`} color="var(--accent-emerald)" isHeader isDashedTop />
    )}

    {(type === 'all' || type === 'garage') && parkingPlaces > 0 && (
      <StatRow
        label={
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Car size={11} /> Miejsca postojowe{type === 'all' ? ' w garażach' : ''}:
          </span>
        }
        value={
          <>
            {Math.floor(parkingPlaces)} mp
            {type === 'garage' && <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '3px' }}>(1 mp / 32,5 m²)</span>}
          </>
        }
        color="var(--accent-sky)"
      />
    )}
  </>
);

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
  const isInteracting = useCadToolStore((s) => s.isInteracting);

  // Active building object
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = buildings.find((item) => item.id === selectedBuildingId);
    if (!b) return null;
    const lyr = b.layer || 'Domyślna (0)';
    return layerSettings[lyr]?.isVisible === false ? null : b;
  }, [buildings, selectedBuildingId, layerSettings]);

  // Działki ewidencyjne (boundary z areaType === 'plot' lub domyślnym, bez playground i paved)
  const boundaryObjects = useMemo(() => {
    return buildings.filter(
      (b) =>
        b.category === 'boundary' &&
        (!b.areaType || b.areaType === 'plot') &&
        b.isIncluded !== false &&
        b.vertices &&
        b.vertices.length >= 3
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

  // Single building metrics - during drag, reuse last calculated metrics
  const rawBuildingMetrics: SingleBuildingMetrics | null = useMemo(() => {
    if (!selectedBuilding || selectedBuilding.category === 'boundary') return null;
    return calculateSingleBuildingMetrics(selectedBuilding, activePlotBoundaries);
  }, [selectedBuilding, activePlotBoundaries]);

  const selectedBuildingMetrics = useStableWhileInteracting(rawBuildingMetrics, isInteracting);

  // Linked group buildings
  const selectedGroupBuildings = useMemo(() => {
    if (!selectedBuilding) return [];
    if (!selectedBuilding.groupId) return [selectedBuilding];
    const inGroup = buildings.filter(
      (b) => b.groupId === selectedBuilding.groupId && b.category !== 'boundary'
    );
    return inGroup.length > 0 ? inGroup : [selectedBuilding];
  }, [buildings, selectedBuilding]);

  const isGroupSelected = selectedGroupBuildings.length > 1;

  // Group summary calculations
  const rawGroupSummary = useMemo(() => {
    if (!isGroupSelected) return null;
    const acc = {
      totalPz: 0,
      totalPcNadz: 0,
      totalPcPodz: 0,
      totalPc: 0,
      totalVolume: 0,
      totalPUM: 0,
      totalPU: 0,
      totalParkingPlaces: 0,
    };

    for (const b of selectedGroupBuildings) {
      const m = calculateSingleBuildingMetrics(b, activePlotBoundaries);
      acc.totalPz += m.pz;
      acc.totalPcNadz += m.pcNadz;
      acc.totalPcPodz += m.pcPodz;
      acc.totalPc += m.pc;
      acc.totalVolume += m.volume;
      acc.totalPUM += m.pum;
      acc.totalPU += m.pu;
      acc.totalParkingPlaces += m.parkingPlaces;
    }

    return {
      count: selectedGroupBuildings.length,
      ...acc,
      totalPUMiU: acc.totalPUM + acc.totalPU,
      buildings: selectedGroupBuildings,
    };
  }, [selectedGroupBuildings, isGroupSelected, activePlotBoundaries]);

  const groupSummary = useStableWhileInteracting(rawGroupSummary, isInteracting);

  // Summary of tested buildings (Projektowane)
  const rawTestedSummary: ProjectParametersResult = useMemo(() => {
    return calculateProjectTotals(buildings, activePlotBoundaries);
  }, [buildings, activePlotBoundaries]);

  const testedBuildingsSummary = useStableWhileInteracting(rawTestedSummary, isInteracting);

  const handleCopyToClipboard = () => {
    const lines: string[] = [
      '=== ZESTAWIENIE PARAMETRÓW PROJEKTU ===',
      `Projektowane budynki: ${testedBuildingsSummary.testedCount}`,
      `Powierzchnia zabudowy (Pz): ${Math.round(testedBuildingsSummary.totalPz)} m²`,
      `Powierzchnia całkowita (Pc): ${Math.round(testedBuildingsSummary.totalPc)} m²`,
      `  - w tym nadziemna: ${Math.round(testedBuildingsSummary.totalPcNadz)} m²`,
      `  - w tym podziemna: ${Math.round(testedBuildingsSummary.totalPcPodz)} m²`,
      `Kubatura brutto (V): ${Math.round(testedBuildingsSummary.totalVolume)} m³`,
      `Szacowany PUM (~70% mieszk.): ${Math.round(testedBuildingsSummary.totalPUM)} m²`,
      `Szacowana PU (~70% usług.): ${Math.round(testedBuildingsSummary.totalPU)} m²`,
      `Łącznie PUMiU: ${Math.round(testedBuildingsSummary.totalPUMiU)} m²`,
    ];

    if (testedBuildingsSummary.totalParkingPlaces > 0) {
      lines.push(`Miejsca postojowe w garażach: ${Math.floor(testedBuildingsSummary.totalParkingPlaces)} mp`);
    }

    if (totalBoundaryArea > 0) {
      lines.push(
        '',
        `--- BILANS TERENU I WSKAŹNIKI URBANISTYCZNE ---`,
        `Powierzchnia działki (Pdz): ${Math.round(totalBoundaryArea)} m²`,
        `Powierzchnia zabudowy (Pz): ${Math.round(testedBuildingsSummary.totalPz)} m² (${testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%)`,
        `Wskaźnik intensywności nadziemnej: ${testedBuildingsSummary.intensityAboveground.toFixed(2)}`,
        `Wskaźnik intensywności podziemnej: ${testedBuildingsSummary.intensityUnderground.toFixed(2)}`,
        `Wskaźnik intensywności całkowitej: ${testedBuildingsSummary.intensityTotal.toFixed(2)}`
      );
      if (testedBuildingsSummary.pavedPlotFootprintArea > 0) {
        lines.push(`Powierzchnie utwardzone na działce: ${Math.round(testedBuildingsSummary.pavedPlotFootprintArea)} m² (${formatPct(testedBuildingsSummary.pavedPlotFootprintArea, totalBoundaryArea)})`);
      }
      if (testedBuildingsSummary.garagePlotFootprintArea > 0) {
        lines.push(`Rzut garaży na działce: ${Math.round(testedBuildingsSummary.garagePlotFootprintArea)} m² (${formatPct(testedBuildingsSummary.garagePlotFootprintArea, totalBoundaryArea)})`);
      }
      lines.push(
        `Grunt rodzimy (poza Pz, garażem i utwardzeniem): ${Math.round(testedBuildingsSummary.nativeGroundArea)} m² (${testedBuildingsSummary.nativeGroundRatio.toFixed(1)}% działki)`
      );
    }

    if (groupSummary) {
      lines.push(
        '',
        `--- POŁĄCZONA GRUPA OBIEKTÓW (${groupSummary.count} szt.) ---`,
        `Łączna powierzchnia zabudowy (Pz): ${Math.round(groupSummary.totalPz)} m²`,
        `Łączna powierzchnia całkowita (Pc): ${Math.round(groupSummary.totalPc)} m² (nadz: ${Math.round(groupSummary.totalPcNadz)} m², podz: ${Math.round(groupSummary.totalPcPodz)} m²)`,
        `Łączna kubatura brutto: ${Math.round(groupSummary.totalVolume)} m³`,
        `PUM: ${Math.round(groupSummary.totalPUM)} m² | PU: ${Math.round(groupSummary.totalPU)} m² | PUMiU: ${Math.round(groupSummary.totalPUMiU)} m²`
      );
      if (groupSummary.totalParkingPlaces > 0) {
        lines.push(`Miejsca postojowe: ${Math.floor(groupSummary.totalParkingPlaces)} mp`);
      }
    }

    if (selectedBuildingMetrics) {
      const typeLabel = selectedBuildingMetrics.buildingType === 'residential' ? 'Mieszkalny' : selectedBuildingMetrics.buildingType === 'service' ? 'Usługowy' : 'Garaż';
      lines.push(
        '',
        `--- ZAZNACZONY OBIEKT: ${selectedBuildingMetrics.name} ---`,
        `Typ: ${typeLabel}`,
        `Liczba kondygnacji: ${selectedBuildingMetrics.storeysCount}`,
        `Wysokość H: ${selectedBuildingMetrics.height.toFixed(2)} m (posadowienie: ${selectedBuildingMetrics.elevation.toFixed(2)} m)`,
        `Powierzchnia zabudowy (Pz): ${Math.round(selectedBuildingMetrics.pz)} m²`,
        `Powierzchnia całkowita (Pc): ${Math.round(selectedBuildingMetrics.pc)} m²`,
        `Kubatura brutto (V): ${Math.round(selectedBuildingMetrics.volume)} m³`
      );
      if (selectedBuildingMetrics.buildingType === 'residential') {
        lines.push(`PUM (~70%): ${Math.round(selectedBuildingMetrics.pum)} m²`, `PUMiU: ${Math.round(selectedBuildingMetrics.pumiu)} m²`);
      } else if (selectedBuildingMetrics.buildingType === 'service') {
        lines.push(`PU (~70%): ${Math.round(selectedBuildingMetrics.pu)} m²`, `PUMiU: ${Math.round(selectedBuildingMetrics.pumiu)} m²`);
      } else if (selectedBuildingMetrics.buildingType === 'garage') {
        lines.push(`Miejsca postojowe: ${Math.floor(selectedBuildingMetrics.parkingPlaces)} mp (1 mp / 32,5 m² Pc)`);
      }
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
      subtitle={`${testedBuildingsSummary.testedCount} bad. / ${boundaryObjects.length} działek`}
      icon={<FileSpreadsheet size={15} />}
      accentColor="emerald"
      badge={testedBuildingsSummary.testedCount > 0 ? `${Math.round(testedBuildingsSummary.totalPz)} m² Pz` : undefined}
      onClose={onClose}
      isEmbedded={isEmbedded}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      collapsible={true}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
        {/* 1. Sekcja: Połączona Grupa Obiektów */}
        {groupSummary && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Link2 size={13} />
                <span>Połączone obiekty ({groupSummary.count} szt.)</span>
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>grupa</span>
            </div>

            <MetricsGroup
              pz={groupSummary.totalPz}
              pc={groupSummary.totalPc}
              volume={groupSummary.totalVolume}
              pum={groupSummary.totalPUM}
              pu={groupSummary.totalPU}
              pumiu={groupSummary.totalPUMiU}
              parkingPlaces={groupSummary.totalParkingPlaces}
            />

            {/* Lista obiektów składowych */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed rgba(56, 189, 248, 0.25)' }}>
              {groupSummary.buildings.map((b) => {
                const isCurrent = b.id === selectedBuilding?.id;
                return (
                  <span
                    key={b.id}
                    style={{
                      fontSize: '9.5px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      backgroundColor: isCurrent ? 'rgba(56, 189, 248, 0.3)' : 'rgba(0,0,0,0.25)',
                      border: isCurrent ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                      color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
                      fontWeight: isCurrent ? 700 : 400,
                    }}
                  >
                    {b.name} ({Math.round(computePolygonArea(b.vertices || []))} m²)
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. Sekcja: Zaznaczony Obiekt */}
        {selectedBuildingMetrics && (
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
                <span>{selectedBuildingMetrics.name}</span>
              </span>
              <span style={{ color: 'var(--accent-sky)', fontSize: '10.5px' }}>
                {selectedBuildingMetrics.storeysCount} kond. (H={selectedBuildingMetrics.height.toFixed(1)}m)
              </span>
            </div>

            <MetricsGroup
              pz={selectedBuildingMetrics.pz}
              pc={selectedBuildingMetrics.pc}
              pcNadz={selectedBuildingMetrics.pcNadz}
              pcPodz={selectedBuildingMetrics.pcPodz}
              volume={selectedBuildingMetrics.volume}
              pum={selectedBuildingMetrics.pum}
              pu={selectedBuildingMetrics.pu}
              pumiu={selectedBuildingMetrics.pumiu}
              parkingPlaces={selectedBuildingMetrics.parkingPlaces}
              type={selectedBuildingMetrics.buildingType}
            />
          </div>
        )}

        {/* 3. Sekcja: Łącznie obiekty badane / projektowane */}
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
            <span>Łącznie obiekty badane ({testedBuildingsSummary.testedCount} szt.)</span>
          </div>

          <MetricsGroup
            pz={testedBuildingsSummary.totalPz}
            pc={testedBuildingsSummary.totalPc}
            pcNadz={testedBuildingsSummary.totalPcNadz}
            pcPodz={testedBuildingsSummary.totalPcPodz}
            volume={testedBuildingsSummary.totalVolume}
            pum={testedBuildingsSummary.totalPUM}
            pu={testedBuildingsSummary.totalPU}
            pumiu={testedBuildingsSummary.totalPUMiU}
            parkingPlaces={testedBuildingsSummary.totalParkingPlaces}
          />
        </div>

        {/* 4. Sekcja: Działki i wskaźniki urbanistyczne (Bilans Terenu) */}
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
          <StatRow
            label="Pow. działki badanej (Pdz):"
            value={totalBoundaryArea > 0 ? `${Math.round(totalBoundaryArea)} m² (${(totalBoundaryArea / 100).toFixed(2)} a)` : 'Brak działek'}
            color="var(--accent-rose)"
          />

          {totalBoundaryArea > 0 && (
            <>
              <StatRow
                label="Powierzchnia zabudowy (Pz):"
                value={`${Math.round(testedBuildingsSummary.totalPz)} m² (${testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%)`}
                color="var(--accent-emerald)"
              />
              {testedBuildingsSummary.pavedPlotFootprintArea > 0 && (
                <StatRow
                  label="Pow. utwardzone na działce:"
                  value={`${Math.round(testedBuildingsSummary.pavedPlotFootprintArea)} m² (${formatPct(testedBuildingsSummary.pavedPlotFootprintArea, totalBoundaryArea)})`}
                  color="var(--accent-amber)"
                />
              )}
              {testedBuildingsSummary.garagePlotFootprintArea > 0 && (
                <StatRow
                  label="Rzut garaży na działce:"
                  value={`${Math.round(testedBuildingsSummary.garagePlotFootprintArea)} m² (${formatPct(testedBuildingsSummary.garagePlotFootprintArea, totalBoundaryArea)})`}
                  color="var(--accent-sky)"
                />
              )}
              <StatRow
                label="Intensywność nadziemna (I_nadz):"
                value={testedBuildingsSummary.intensityAboveground.toFixed(2)}
                color="var(--accent-sky)"
              />
              {testedBuildingsSummary.totalPcPodz > 0 && (
                <StatRow
                  label="Intensywność podziemna (I_podz):"
                  value={testedBuildingsSummary.intensityUnderground.toFixed(2)}
                  color="var(--accent-purple, #c084fc)"
                />
              )}
              <StatRow
                label="Intensywność całkowita (I_całk):"
                value={testedBuildingsSummary.intensityTotal.toFixed(2)}
                color="var(--text-primary)"
              />

              {/* Grunt rodzimy poza Pz, garażem i utwardzeniem */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px', borderTop: '1px dashed rgba(239, 68, 68, 0.25)' }}>
                <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  <TreePine size={12} /> Grunt rodzimy:
                </span>
                <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>
                  {Math.round(testedBuildingsSummary.nativeGroundArea)} m² ({testedBuildingsSummary.nativeGroundRatio.toFixed(1)}%)
                </b>
              </div>
            </>
          )}
        </div>

        {/* 5. Przycisk Kopiuj do schowka */}
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
