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
import { useSceneStore, useUiStore } from '../../store';
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

  // Single building metrics
  const selectedBuildingMetrics: SingleBuildingMetrics | null = useMemo(() => {
    if (!selectedBuilding || selectedBuilding.category === 'boundary') return null;
    return calculateSingleBuildingMetrics(selectedBuilding, activePlotBoundaries);
  }, [selectedBuilding, activePlotBoundaries]);

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
  const groupSummary = useMemo(() => {
    if (!isGroupSelected) return null;
    let totalPz = 0;
    let totalPcNadz = 0;
    let totalPcPodz = 0;
    let totalPc = 0;
    let totalVolume = 0;
    let totalPUM = 0;
    let totalPU = 0;
    let totalParkingPlaces = 0;

    for (const b of selectedGroupBuildings) {
      const m = calculateSingleBuildingMetrics(b, activePlotBoundaries);
      totalPz += m.pz;
      totalPcNadz += m.pcNadz;
      totalPcPodz += m.pcPodz;
      totalPc += m.pc;
      totalVolume += m.volume;
      totalPUM += m.pum;
      totalPU += m.pu;
      totalParkingPlaces += m.parkingPlaces;
    }

    const totalPUMiU = totalPUM + totalPU;

    return {
      count: selectedGroupBuildings.length,
      totalPz,
      totalPcNadz,
      totalPcPodz,
      totalPc,
      totalVolume,
      totalPUM,
      totalPU,
      totalPUMiU,
      totalParkingPlaces,
      buildings: selectedGroupBuildings,
    };
  }, [selectedGroupBuildings, isGroupSelected, activePlotBoundaries]);

  // Summary of tested buildings (Projektowane)
  const testedBuildingsSummary: ProjectParametersResult = useMemo(() => {
    return calculateProjectTotals(buildings, activePlotBoundaries);
  }, [buildings, activePlotBoundaries]);

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
        lines.push(`Powierzchnie utwardzone na działce: ${Math.round(testedBuildingsSummary.pavedPlotFootprintArea)} m² (${((testedBuildingsSummary.pavedPlotFootprintArea / totalBoundaryArea) * 100).toFixed(1)}%)`);
      }
      if (testedBuildingsSummary.garagePlotFootprintArea > 0) {
        lines.push(`Rzut garaży na działce: ${Math.round(testedBuildingsSummary.garagePlotFootprintArea)} m² (${((testedBuildingsSummary.garagePlotFootprintArea / totalBoundaryArea) * 100).toFixed(1)}%)`);
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
      lines.push(
        '',
        `--- ZAZNACZONY OBIEKT: ${selectedBuildingMetrics.name} ---`,
        `Typ: ${selectedBuildingMetrics.buildingType === 'residential' ? 'Mieszkalny' : selectedBuildingMetrics.buildingType === 'service' ? 'Usługowy' : 'Garaż'}`,
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. zabudowy (Pz):</span>
              <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalPz)} m²</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. całkowita (Pc):</span>
              <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalPc)} m²</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Łączna kubatura brutto (V):</span>
              <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalVolume)} m³</b>
            </div>

            {groupSummary.totalPUM > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>PUM (~70% mieszk.):</span>
                <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalPUM)} m²</b>
              </div>
            )}
            {groupSummary.totalPU > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>PU (~70% usług.):</span>
                <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalPU)} m²</b>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px', borderTop: '1px dashed rgba(56, 189, 248, 0.2)' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Łącznie PUMiU:</span>
              <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(groupSummary.totalPUMiU)} m²</b>
            </div>

            {groupSummary.totalParkingPlaces > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Car size={11} /> Miejsca postojowe:
                </span>
                <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{Math.floor(groupSummary.totalParkingPlaces)} mp</b>
              </div>
            )}

            {/* Lista obiektów składowych */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed rgba(56, 189, 248, 0.25)' }}>
              {groupSummary.buildings.map((b) => (
                <span
                  key={b.id}
                  style={{
                    fontSize: '9.5px',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    backgroundColor: b.id === selectedBuilding?.id ? 'rgba(56, 189, 248, 0.3)' : 'rgba(0,0,0,0.25)',
                    border: b.id === selectedBuilding?.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                    color: b.id === selectedBuilding?.id ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: b.id === selectedBuilding?.id ? 700 : 400,
                  }}
                >
                  {b.name} ({Math.round(computePolygonArea(b.vertices || []))} m²)
                </span>
              ))}
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia zabudowy (Pz):</span>
              <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.pz)} m²</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia całkowita (Pc):</span>
              <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>
                {Math.round(selectedBuildingMetrics.pc)} m²
                {selectedBuildingMetrics.pcPodz > 0 && selectedBuildingMetrics.pcNadz > 0 && (
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    (nadz: {Math.round(selectedBuildingMetrics.pcNadz)}, podz: {Math.round(selectedBuildingMetrics.pcPodz)})
                  </span>
                )}
              </b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Kubatura brutto (V):</span>
              <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.volume)} m³</b>
            </div>

            {selectedBuildingMetrics.buildingType === 'residential' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>PUM (~70%):</span>
                  <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.pum)} m²</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>PUMiU:</span>
                  <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.pumiu)} m²</b>
                </div>
              </>
            )}

            {selectedBuildingMetrics.buildingType === 'service' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>PU (~70%):</span>
                  <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.pu)} m²</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>PUMiU:</span>
                  <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(selectedBuildingMetrics.pumiu)} m²</b>
                </div>
              </>
            )}

            {selectedBuildingMetrics.buildingType === 'garage' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Car size={11} /> Miejsca postojowe:
                </span>
                <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>
                  {Math.floor(selectedBuildingMetrics.parkingPlaces)} mp
                  <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '3px' }}>(1 mp / 32,5 m²)</span>
                </b>
              </div>
            )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. zabudowy (Pz):</span>
            <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPz)} m²</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna pow. całkowita (Pc):</span>
            <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>
              {Math.round(testedBuildingsSummary.totalPc)} m²
              {testedBuildingsSummary.totalPcPodz > 0 && (
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                  (nadz: {Math.round(testedBuildingsSummary.totalPcNadz)}, podz: {Math.round(testedBuildingsSummary.totalPcPodz)})
                </span>
              )}
            </b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Łączna kubatura (V):</span>
            <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalVolume)} m³</b>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Szacowany PUM (~70% mieszk.):</span>
            <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPUM)} m²</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Szacowana PU (~70% usług.):</span>
            <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPU)} m²</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px', borderTop: '1px dashed rgba(99, 102, 241, 0.25)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Łącznie PUMiU:</span>
            <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPUMiU)} m²</b>
          </div>

          {testedBuildingsSummary.totalParkingPlaces > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Car size={11} /> Miejsca postojowe w garażach:
              </span>
              <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>
                {Math.floor(testedBuildingsSummary.totalParkingPlaces)} mp
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginLeft: '3px' }}>(1 mp / 32,5 m²)</span>
              </b>
            </div>
          )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Pow. działki badanej (Pdz):</span>
            <b style={{ color: 'var(--accent-rose)', fontFamily: 'monospace' }}>
              {totalBoundaryArea > 0 ? `${Math.round(totalBoundaryArea)} m² (${(totalBoundaryArea / 100).toFixed(2)} a)` : 'Brak działek'}
            </b>
          </div>
          {totalBoundaryArea > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia zabudowy (Pz):</span>
                <b style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>
                  {Math.round(testedBuildingsSummary.totalPz)} m² ({testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%)
                </b>
              </div>
              {testedBuildingsSummary.pavedPlotFootprintArea > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pow. utwardzone na działce:</span>
                  <b style={{ color: 'var(--accent-amber)', fontFamily: 'monospace' }}>
                    {Math.round(testedBuildingsSummary.pavedPlotFootprintArea)} m² ({((testedBuildingsSummary.pavedPlotFootprintArea / totalBoundaryArea) * 100).toFixed(1)}%)
                  </b>
                </div>
              )}
              {testedBuildingsSummary.garagePlotFootprintArea > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Rzut garaży na działce:</span>
                  <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>
                    {Math.round(testedBuildingsSummary.garagePlotFootprintArea)} m² ({((testedBuildingsSummary.garagePlotFootprintArea / totalBoundaryArea) * 100).toFixed(1)}%)
                  </b>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Intensywność nadziemna (I_nadz):</span>
                <b style={{ color: 'var(--accent-sky)', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityAboveground.toFixed(2)}</b>
              </div>
              {testedBuildingsSummary.totalPcPodz > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Intensywność podziemna (I_podz):</span>
                  <b style={{ color: 'var(--accent-purple, #c084fc)', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityUnderground.toFixed(2)}</b>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Intensywność całkowita (I_całk):</span>
                <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityTotal.toFixed(2)}</b>
              </div>

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
