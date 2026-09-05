import React, { useMemo, useState } from 'react';
import {
  Layers,
  Building,
  Square,
  Lock,
  Unlock,
  Ghost,
  Lightbulb,
  LightbulbOff,
  FileSpreadsheet,
  Copy,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Sun,
  Trees,
  Sliders,
} from 'lucide-react';
import { useSceneStore, useSolarAnalysisStore, useCadToolStore, useUiStore } from '../../store';
import {
  computePolygonArea,
  computeBuildingsUnionArea,
  computeDistancesToBoundaries,
  computePolygonIntersectionWithBoundaries,
} from '@/utils/math2d';
import { rebuildBuildingSegments } from '../../utils/segmentStatistics';
import { calculateBuildingFloors, toRomanNumeral } from '../../utils/buildingFloorCalculator';
import { analyzePlaygroundSunlight } from '../../engine/analysisEngine';
import { computePlaygroundApartmentCapacity } from '../../utils/playgroundUtils';

export const LayersAndObjectsGroup: React.FC = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const setBuildings = useSceneStore((s) => s.setBuildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const setSelectedBuildingIds = useSceneStore((s) => s.setSelectedBuildingIds);
  const selectBuilding = useSceneStore((s) => s.selectBuilding);
  const updateBuilding = useSceneStore((s) => s.updateBuilding);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const selectedLayerName = useSceneStore((s) => s.selectedLayerName);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const toggleLayerLock = useSceneStore((s) => s.toggleLayerLock);
  const toggleLayerGhost = useSceneStore((s) => s.toggleLayerGhost);
  const toggleLayerVisibility = useSceneStore((s) => s.toggleLayerVisibility);
  const updateLayerBuildings = useSceneStore((s) => s.updateLayerBuildings);
  const selectLayerBuildings = useSceneStore((s) => s.selectLayerBuildings);
  const updateSelectedBuilding = useSceneStore((s) => s.updateSelectedBuilding);
  const rotateBuilding = useSceneStore((s) => s.rotateBuilding);

  const settings = useSolarAnalysisStore((s) => s.settings);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);

  const setIsInteracting = useCadToolStore((s) => s.setIsInteracting);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);
  const copiedToast = useUiStore((s) => s.copiedToast);

  const [collapsedTreeGroups, setCollapsedTreeGroups] = useState<Record<string, boolean>>({});

  const toggleTreeGroup = (groupKey: string) => {
    setCollapsedTreeGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

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

  // Active CAD layers from current buildings
  const activeCadLayers = useMemo(() => {
    const map = new Map<string, typeof buildings>();
    buildings.forEach((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      const list = map.get(lyr) || [];
      list.push(b);
      map.set(lyr, list);
    });
    return Array.from(map.entries()).map(([name, bldgs]) => ({
      name,
      count: bldgs.length,
      area: computeBuildingsUnionArea(bldgs),
    }));
  }, [buildings]);

  // Działki (boundary, wykluczając place zabaw)
  const boundaryObjects = useMemo(() => {
    return buildings.filter(
      (b) => b.category === 'boundary' && b.areaType !== 'playground' && b.isIncluded !== false && b.vertices && b.vertices.length >= 3
    );
  }, [buildings]);

  // Obliczenia nasłonecznienia placu zabaw wg § 33 ust. 3 WT
  const playgroundAnalysis = useMemo(() => {
    if (
      !selectedBuilding ||
      selectedBuilding.category !== 'boundary' ||
      selectedBuilding.areaType !== 'playground' ||
      !selectedBuilding.isTested ||
      !selectedBuilding.vertices ||
      selectedBuilding.vertices.length < 3
    ) {
      return null;
    }
    return analyzePlaygroundSunlight(selectedBuilding, buildings, settings, sunlightMethod);
  }, [selectedBuilding, buildings, settings, sunlightMethod]);

  // Grupowanie obiektów do drzewa projektu
  const objectTree = useMemo(() => {
    const buildingList = buildings.filter((b) => b.category !== 'boundary' && b.category !== 'balcony');
    const areaList = buildings.filter((b) => b.category === 'boundary');
    const balconyList = buildings.filter((b) => b.category === 'balcony');

    // Podgrupy budynków wg H i posadowienia (elevation)
    const buildingSubgroupsMap = new Map<string, { height: number; elevation: number; items: typeof buildings }>();
    buildingList.forEach((b) => {
      const h = b.defaultHeight || 15.0;
      const elev = b.elevation ?? 0.0;
      const key = `H_${h}_E_${elev}`;
      const existing = buildingSubgroupsMap.get(key) || { height: h, elevation: elev, items: [] };
      existing.items.push(b);
      buildingSubgroupsMap.set(key, existing);
    });

    const buildingSubgroups = Array.from(buildingSubgroupsMap.entries()).map(([key, group]) => ({
      key,
      height: group.height,
      elevation: group.elevation,
      label: `H = ${group.height}m, posad. ${group.elevation}m`,
      items: group.items,
    }));

    // Podgrupy obszarów: Działki vs Place zabaw
    const plotList = areaList.filter((b) => b.areaType !== 'playground');
    const playgroundList = areaList.filter((b) => b.areaType === 'playground');

    return {
      buildingList,
      buildingSubgroups,
      areaList,
      plotList,
      playgroundList,
      balconyList,
    };
  }, [buildings]);

  // Działki z włączonym "Obiekt badany (isTested)" dla kalkulacji wskaźników
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

  // Distances from selected building to all boundaries
  const distancesToBoundaries = useMemo(() => {
    if (!selectedBuilding || selectedBuilding.category === 'boundary' || boundaryObjects.length === 0) return [];
    return computeDistancesToBoundaries(selectedBuilding, boundaryObjects);
  }, [selectedBuilding, boundaryObjects]);

  // Summary of tested buildings (Projektowane)
  // Kalkulacja wskaźników powierzchni zabudowy i intensywności dotyczy części budynków znajdujących się na działce z isTested
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

      const n = b.storeysCount || (b.defaultHeight > 3.0 ? 1 + Math.max(1, Math.round((b.defaultHeight - 3.0) / 3.0)) : 1);
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

  // Obrót obiektu wokół centroidu
  const handleBuildingRotate = (id: string, pivot: { x: number; y: number }, deltaAngleRad: number) => {
    setIsInteracting(true);
    rotateBuilding(id, pivot, deltaAngleRad);
  };

  const handleSetBuildingAbsoluteRotation = (buildingId: string, targetDeg: number) => {
    const targetIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : [buildingId];
    targetIds.forEach((id) => {
      const target = buildings.find((b) => b.id === id);
      if (!target || target.vertices.length < 3) return;

      const currentRot = target.transform?.rotationDeg !== undefined
        ? target.transform.rotationDeg
        : target.segments.length > 0
        ? ((target.segments[0].angleRad * 180) / Math.PI + 360) % 360
        : 0;

      let deltaDeg = targetDeg - currentRot;
      while (deltaDeg > 180) deltaDeg -= 360;
      while (deltaDeg < -180) deltaDeg += 360;

      const deltaRad = (deltaDeg * Math.PI) / 180;
      let cx = 0;
      let cy = 0;
      for (const v of target.vertices) {
        cx += v.x;
        cy += v.y;
      }
      const pivot = { x: cx / target.vertices.length, y: cy / target.vertices.length };
      handleBuildingRotate(id, pivot, deltaRad);
    });
  };

  return (
    <div className="sidebar-group-content">
      {/* 2.0 Warstwy CAD */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Warstwy CAD ({activeCadLayers.length})</span>
          <Layers size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {activeCadLayers.map((lyr) => {
              const isSelected = selectedLayerName === lyr.name;
              const setting = layerSettings[lyr.name] || {};
              const isLocked = setting.isLocked === true;
              const isGhosted = setting.isGhosted === true;
              const isVisible = setting.isVisible !== false;

              return (
                <div
                  key={lyr.name}
                  onClick={() => setSelectedLayerName(lyr.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'rgba(99, 102, 241, 0.16)'
                      : 'rgba(15, 23, 42, 0.6)',
                    border: isSelected
                      ? '1px solid rgba(99, 102, 241, 0.45)'
                      : '1px solid var(--border-light)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? '#e0e7ff' : '#cbd5e1',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={lyr.name}
                    >
                      {lyr.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#cbd5e1',
                          backgroundColor: 'rgba(30, 41, 59, 0.8)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {lyr.count} ob.
                      </span>
                    </div>
                  </div>

                  {/* 3 Action Controls: Kłódka, Duch, Żarówka */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => selectLayerBuildings(lyr.name)}
                      title="Zaznacz wszystkie obiekty na tej warstwie"
                      style={{
                        padding: '4px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckSquare size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLayerLock(lyr.name)}
                      title={isLocked ? 'Odblokuj przesuwanie i edycję' : 'Zablokuj przesuwanie i edycję'}
                      style={{
                        padding: '4px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: isLocked ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        color: isLocked ? '#fbbf24' : '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLayerGhost(lyr.name)}
                      title={isGhosted ? 'Wyłącz tryb Ducha' : 'Włącz tryb Ducha'}
                      style={{
                        padding: '4px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: isGhosted ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
                        color: isGhosted ? '#c084fc' : '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ghost size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLayerVisibility(lyr.name)}
                      title={isVisible ? 'Wyłącz warstwę' : 'Włącz warstwę'}
                      style={{
                        padding: '4px',
                        borderRadius: '5px',
                        border: 'none',
                        backgroundColor: isVisible ? 'rgba(250, 204, 21, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                        color: isVisible ? '#fde047' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isVisible ? <Lightbulb size={13} /> : <LightbulbOff size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Layer Properties & Mass Edit */}
          {selectedLayerName && (() => {
            const layerBuildings = buildings.filter((b) => (b.layer || 'Domyślna (0)') === selectedLayerName);
            if (layerBuildings.length === 0) return null;

            const allIncluded = layerBuildings.every((b) => b.isIncluded !== false);
            const someIncluded = layerBuildings.some((b) => b.isIncluded !== false);
            const allTested = layerBuildings.every((b) => b.isTested);
            const someTested = layerBuildings.some((b) => b.isTested);
            const allCityCentre = layerBuildings.every((b) => b.isCityCentre);
            const someCityCentre = layerBuildings.some((b) => b.isCityCentre);
            const commonHeight = layerBuildings[0]?.defaultHeight ?? 15;

            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingTop: '8px',
                  marginTop: '2px',
                  borderTop: '1px dashed var(--border-light)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    Wysokość H dla warstwy (m)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={commonHeight}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      updateLayerBuildings(selectedLayerName, { defaultHeight: val });
                    }}
                    style={{
                      width: '80px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      color: '#38bdf8',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      textAlign: 'right',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => updateLayerBuildings(selectedLayerName, { isIncluded: !allIncluded })}
                    className={`btn-tile ${allIncluded ? 'active-emerald' : someIncluded ? 'active-amber' : 'inactive'}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 4px',
                      textAlign: 'center',
                      minHeight: '48px',
                    }}
                    title="Uwzględnij w kalkulacji (wszystkie obiekty na warstwie)"
                  >
                    <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Uwzględnij w kalkulacji</span>
                    <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
                      {allIncluded ? 'TAK' : someIncluded ? 'CZĘŚĆ' : 'NIE'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateLayerBuildings(selectedLayerName, { isTested: !allTested })}
                    className={`btn-tile ${allTested ? 'active-indigo' : someTested ? 'active-amber' : 'inactive'}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 4px',
                      textAlign: 'center',
                      minHeight: '48px',
                    }}
                    title="Obiekt badany / Projektowany (wszystkie obiekty na warstwie)"
                  >
                    <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Obiekt badany</span>
                    <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
                      {allTested ? 'TAK' : someTested ? 'CZĘŚĆ' : 'NIE'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateLayerBuildings(selectedLayerName, { isCityCentre: !allCityCentre })}
                    className={`btn-tile ${allCityCentre ? 'active-amber' : someCityCentre ? 'active-indigo' : 'inactive'}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 4px',
                      textAlign: 'center',
                      minHeight: '48px',
                    }}
                    title="Zabudowa śródmiejska (wszystkie obiekty na warstwie)"
                  >
                    <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Zabudowa śródmiejska</span>
                    <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
                      {allCityCentre ? 'TAK' : someCityCentre ? 'CZĘŚĆ' : 'NIE'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 2.1 Obiekty w projekcie */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Obiekty ({buildings.length})</span>
          <Building size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Grupa 1: Budynki */}
          {objectTree.buildingList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div
                onClick={() => toggleTreeGroup('cat_buildings')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {collapsedTreeGroups['cat_buildings'] ? (
                    <ChevronRight size={13} color="#818cf8" />
                  ) : (
                    <ChevronDown size={13} color="#818cf8" />
                  )}
                  <Building size={13} color="#818cf8" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#e0e7ff' }}>
                    Budynki ({objectTree.buildingList.length})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Zaznacz wszystkie budynki"
                    onClick={() => setSelectedBuildingIds(objectTree.buildingList.map((b) => b.id))}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px 4px' }}
                  >
                    <CheckSquare size={13} />
                  </button>
                  <button
                    type="button"
                    title="Zablokuj/odblokuj wszystkie budynki"
                    onClick={() => {
                      const allLocked = objectTree.buildingList.every((b) => b.isLocked);
                      objectTree.buildingList.forEach((b) => updateBuilding(b.id, { isLocked: !allLocked }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.buildingList.every((b) => b.isLocked) ? '#fbbf24' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    {objectTree.buildingList.every((b) => b.isLocked) ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    type="button"
                    title="Włącz/wyłącz tryb ducha dla wszystkich budynków"
                    onClick={() => {
                      const allGhosted = objectTree.buildingList.every((b) => b.isGhosted);
                      objectTree.buildingList.forEach((b) => updateBuilding(b.id, { isGhosted: !allGhosted }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.buildingList.every((b) => b.isGhosted) ? '#c084fc' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    <Ghost size={13} />
                  </button>
                </div>
              </div>

              {!collapsedTreeGroups['cat_buildings'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                  {objectTree.buildingSubgroups.map((subgroup) => {
                    const groupKey = `bldg_sub_${subgroup.key}`;
                    const isSubCollapsed = !!collapsedTreeGroups[groupKey];
                    const allSubLocked = subgroup.items.every((b) => b.isLocked);
                    const allSubGhosted = subgroup.items.every((b) => b.isGhosted);

                    return (
                      <div key={subgroup.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {/* Subgroup Header */}
                        <div
                          onClick={() => toggleTreeGroup(groupKey)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 6px',
                            borderRadius: '5px',
                            backgroundColor: 'rgba(30, 41, 59, 0.5)',
                            border: '1px solid rgba(51, 65, 85, 0.4)',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {isSubCollapsed ? <ChevronRight size={12} color="#94a3b8" /> : <ChevronDown size={12} color="#94a3b8" />}
                            <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#cbd5e1' }}>
                              {subgroup.label} ({subgroup.items.length})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Zaznacz obiekty w tej grupie parametrów"
                              onClick={() => setSelectedBuildingIds(subgroup.items.map((b) => b.id))}
                              style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px' }}
                            >
                              <CheckSquare size={12} />
                            </button>
                            <button
                              type="button"
                              title={allSubLocked ? 'Odblokuj grupę' : 'Zablokuj grupę'}
                              onClick={() => subgroup.items.forEach((b) => updateBuilding(b.id, { isLocked: !allSubLocked }))}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: allSubLocked ? '#fbbf24' : '#64748b',
                                cursor: 'pointer',
                                padding: '2px',
                              }}
                            >
                              {allSubLocked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                              type="button"
                              title={allSubGhosted ? 'Wyłącz ducha' : 'Włącz ducha'}
                              onClick={() => subgroup.items.forEach((b) => updateBuilding(b.id, { isGhosted: !allSubGhosted }))}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: allSubGhosted ? '#c084fc' : '#64748b',
                                cursor: 'pointer',
                                padding: '2px',
                              }}
                            >
                              <Ghost size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Subgroup Single Objects (NO dimensions) */}
                        {!isSubCollapsed && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                            {subgroup.items.map((b) => {
                              const isSelected = selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id;
                              const isLocked = b.isLocked === true;
                              const isGhosted = b.isGhosted === true;

                              return (
                                <div
                                  key={b.id}
                                  onClick={() => selectBuilding(b.id, false)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '4px 6px',
                                    borderRadius: '5px',
                                    backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                                    border: isSelected ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(51, 65, 85, 0.25)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: isSelected ? 700 : 500,
                                      color: isSelected ? '#e0e7ff' : '#94a3b8',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                    }}
                                    title={b.name}
                                  >
                                    {b.name}
                                  </span>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      title={isSelected ? 'Odznacz' : 'Zaznacz'}
                                      onClick={() => selectBuilding(b.id, true)}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: isSelected ? '#38bdf8' : '#64748b',
                                        cursor: 'pointer',
                                        padding: '2px',
                                      }}
                                    >
                                      <CheckSquare size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      title={isLocked ? 'Odblokuj' : 'Zablokuj'}
                                      onClick={() => updateBuilding(b.id, { isLocked: !isLocked })}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: isLocked ? '#fbbf24' : '#64748b',
                                        cursor: 'pointer',
                                        padding: '2px',
                                      }}
                                    >
                                      {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                    </button>
                                    <button
                                      type="button"
                                      title={isGhosted ? 'Wyłącz ducha' : 'Włącz ducha'}
                                      onClick={() => updateBuilding(b.id, { isGhosted: !isGhosted })}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: isGhosted ? '#c084fc' : '#64748b',
                                        cursor: 'pointer',
                                        padding: '2px',
                                      }}
                                    >
                                      <Ghost size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Grupa 2: Obszary (Działki i Place zabaw) */}
          {objectTree.areaList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div
                onClick={() => toggleTreeGroup('cat_areas')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {collapsedTreeGroups['cat_areas'] ? (
                    <ChevronRight size={13} color="#fca5a5" />
                  ) : (
                    <ChevronDown size={13} color="#fca5a5" />
                  )}
                  <Square size={13} color="#ef4444" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5' }}>
                    Obszary ({objectTree.areaList.length})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Zaznacz wszystkie obszary"
                    onClick={() => setSelectedBuildingIds(objectTree.areaList.map((b) => b.id))}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px 4px' }}
                  >
                    <CheckSquare size={13} />
                  </button>
                  <button
                    type="button"
                    title="Zablokuj/odblokuj wszystkie obszary"
                    onClick={() => {
                      const allLocked = objectTree.areaList.every((b) => b.isLocked);
                      objectTree.areaList.forEach((b) => updateBuilding(b.id, { isLocked: !allLocked }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.areaList.every((b) => b.isLocked) ? '#fbbf24' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    {objectTree.areaList.every((b) => b.isLocked) ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    type="button"
                    title="Włącz/wyłącz tryb ducha dla wszystkich obszarów"
                    onClick={() => {
                      const allGhosted = objectTree.areaList.every((b) => b.isGhosted);
                      objectTree.areaList.forEach((b) => updateBuilding(b.id, { isGhosted: !allGhosted }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.areaList.every((b) => b.isGhosted) ? '#c084fc' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    <Ghost size={13} />
                  </button>
                </div>
              </div>

              {!collapsedTreeGroups['cat_areas'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                  {/* Działki */}
                  {objectTree.plotList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div
                        onClick={() => toggleTreeGroup('area_sub_plots')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(30, 41, 59, 0.4)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#fca5a5' }}>
                          Działki ({objectTree.plotList.length})
                        </span>
                      </div>
                      {!collapsedTreeGroups['area_sub_plots'] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                          {objectTree.plotList.map((b) => {
                            const isSelected = selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id;
                            const isLocked = b.isLocked === true;
                            const isGhosted = b.isGhosted === true;
                            return (
                              <div
                                key={b.id}
                                onClick={() => selectBuilding(b.id, false)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  borderRadius: '5px',
                                  backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                                  border: isSelected ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(51, 65, 85, 0.25)',
                                  cursor: 'pointer',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: isSelected ? 700 : 500,
                                    color: isSelected ? '#fca5a5' : '#94a3b8',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {b.plotNumber ? `Działka ${b.plotNumber}` : b.name}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => selectBuilding(b.id, true)}
                                    style={{ background: 'transparent', border: 'none', color: isSelected ? '#38bdf8' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    <CheckSquare size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateBuilding(b.id, { isLocked: !isLocked })}
                                    style={{ background: 'transparent', border: 'none', color: isLocked ? '#fbbf24' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateBuilding(b.id, { isGhosted: !isGhosted })}
                                    style={{ background: 'transparent', border: 'none', color: isGhosted ? '#c084fc' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    <Ghost size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Place zabaw */}
                  {objectTree.playgroundList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div
                        onClick={() => toggleTreeGroup('area_sub_playgrounds')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(30, 41, 59, 0.4)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#34d399' }}>
                          Place zabaw ({objectTree.playgroundList.length})
                        </span>
                      </div>
                      {!collapsedTreeGroups['area_sub_playgrounds'] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                          {objectTree.playgroundList.map((b) => {
                            const isSelected = selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id;
                            const isLocked = b.isLocked === true;
                            const isGhosted = b.isGhosted === true;
                            return (
                              <div
                                key={b.id}
                                onClick={() => selectBuilding(b.id, false)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 6px',
                                  borderRadius: '5px',
                                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                                  border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(51, 65, 85, 0.25)',
                                  cursor: 'pointer',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: isSelected ? 700 : 500,
                                    color: isSelected ? '#34d399' : '#94a3b8',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {b.name}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => selectBuilding(b.id, true)}
                                    style={{ background: 'transparent', border: 'none', color: isSelected ? '#38bdf8' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    <CheckSquare size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateBuilding(b.id, { isLocked: !isLocked })}
                                    style={{ background: 'transparent', border: 'none', color: isLocked ? '#fbbf24' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateBuilding(b.id, { isGhosted: !isGhosted })}
                                    style={{ background: 'transparent', border: 'none', color: isGhosted ? '#c084fc' : '#64748b', cursor: 'pointer', padding: '2px' }}
                                  >
                                    <Ghost size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Grupa 3: Balkony */}
          {objectTree.balconyList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div
                onClick={() => toggleTreeGroup('cat_balconies')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {collapsedTreeGroups['cat_balconies'] ? (
                    <ChevronRight size={13} color="#38bdf8" />
                  ) : (
                    <ChevronDown size={13} color="#38bdf8" />
                  )}
                  <Square size={13} color="#38bdf8" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#e0f2fe' }}>
                    Balkony ({objectTree.balconyList.length})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Zaznacz wszystkie balkony"
                    onClick={() => setSelectedBuildingIds(objectTree.balconyList.map((b) => b.id))}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px 4px' }}
                  >
                    <CheckSquare size={13} />
                  </button>
                  <button
                    type="button"
                    title="Zablokuj/odblokuj wszystkie balkony"
                    onClick={() => {
                      const allLocked = objectTree.balconyList.every((b) => b.isLocked);
                      objectTree.balconyList.forEach((b) => updateBuilding(b.id, { isLocked: !allLocked }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.balconyList.every((b) => b.isLocked) ? '#fbbf24' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    {objectTree.balconyList.every((b) => b.isLocked) ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    type="button"
                    title="Włącz/wyłącz tryb ducha dla wszystkich balkonów"
                    onClick={() => {
                      const allGhosted = objectTree.balconyList.every((b) => b.isGhosted);
                      objectTree.balconyList.forEach((b) => updateBuilding(b.id, { isGhosted: !allGhosted }));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: objectTree.balconyList.every((b) => b.isGhosted) ? '#c084fc' : '#64748b',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    <Ghost size={13} />
                  </button>
                </div>
              </div>

              {!collapsedTreeGroups['cat_balconies'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                  {objectTree.balconyList.map((b) => {
                    const isSelected = selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id;
                    const isLocked = b.isLocked === true;
                    const isGhosted = b.isGhosted === true;
                    return (
                      <div
                        key={b.id}
                        onClick={() => selectBuilding(b.id, false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 6px',
                          borderRadius: '5px',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                          border: isSelected ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(51, 65, 85, 0.25)',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#e0f2fe' : '#94a3b8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => selectBuilding(b.id, true)}
                            style={{ background: 'transparent', border: 'none', color: isSelected ? '#38bdf8' : '#64748b', cursor: 'pointer', padding: '2px' }}
                          >
                            <CheckSquare size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBuilding(b.id, { isLocked: !isLocked })}
                            style={{ background: 'transparent', border: 'none', color: isLocked ? '#fbbf24' : '#64748b', cursor: 'pointer', padding: '2px' }}
                          >
                            {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBuilding(b.id, { isGhosted: !isGhosted })}
                            style={{ background: 'transparent', border: 'none', color: isGhosted ? '#c084fc' : '#64748b', cursor: 'pointer', padding: '2px' }}
                          >
                            <Ghost size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Edycja Obiektu 2.5D */}
      {selectedBuilding ? (
        <div className="ui-card">
          <div className="ui-title">
            <span>
              {selectedBuildingIds.length > 1
                ? `Edycja obiektów (zaznaczono: ${selectedBuildingIds.length})`
                : 'Edycja Obiektu 2.5D'}
            </span>
            <Building size={14} color="#818cf8" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* 1. Nazwa obiektu ZAWSZE na samej górze */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nazwa</label>
              <input
                type="text"
                value={selectedBuilding.name}
                onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '7px 10px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
            </div>

            {/* 2. Przełączniki kategorii (Budynek / Obszar) bez etykiety tekstowej */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
              <button
                type="button"
                onClick={() => updateSelectedBuilding({ category: 'building' })}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony'
                    ? '1px solid #818cf8'
                    : '1px solid var(--border-light)',
                  backgroundColor: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony'
                    ? 'rgba(99, 102, 241, 0.25)'
                    : 'var(--bg-input)',
                  color: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony' ? '#e0e7ff' : '#94a3b8',
                  fontWeight: selectedBuilding.category !== 'boundary' && selectedBuilding.category !== 'balcony' ? 700 : 500,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                }}
              >
                <Building size={13} />
                <span>Budynek</span>
              </button>

              <button
                type="button"
                onClick={() => updateSelectedBuilding({ category: 'boundary', defaultHeight: 0 })}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: selectedBuilding.category === 'boundary'
                    ? '1px solid #ef4444'
                    : '1px solid var(--border-light)',
                  backgroundColor: selectedBuilding.category === 'boundary'
                    ? 'rgba(239, 68, 68, 0.25)'
                    : 'var(--bg-input)',
                  color: selectedBuilding.category === 'boundary' ? '#fca5a5' : '#94a3b8',
                  fontWeight: selectedBuilding.category === 'boundary' ? 700 : 500,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                }}
              >
                <Square size={13} />
                <span>Obszar</span>
              </button>
            </div>

            {selectedBuilding.category === 'boundary' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Podtyp Obszaru: Działka vs Plac zabaw */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Typ obszaru
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => updateSelectedBuilding({ areaType: 'plot' })}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: (!selectedBuilding.areaType || selectedBuilding.areaType === 'plot')
                          ? '1px solid #ef4444'
                          : '1px solid var(--border-light)',
                        backgroundColor: (!selectedBuilding.areaType || selectedBuilding.areaType === 'plot')
                          ? 'rgba(239, 68, 68, 0.25)'
                          : 'var(--bg-input)',
                        color: (!selectedBuilding.areaType || selectedBuilding.areaType === 'plot') ? '#fca5a5' : '#94a3b8',
                        fontWeight: (!selectedBuilding.areaType || selectedBuilding.areaType === 'plot') ? 700 : 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Działka
                    </button>

                    <button
                      type="button"
                      onClick={() => updateSelectedBuilding({ areaType: 'playground' })}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: selectedBuilding.areaType === 'playground'
                          ? '1px solid #10b981'
                          : '1px solid var(--border-light)',
                        backgroundColor: selectedBuilding.areaType === 'playground'
                          ? 'rgba(16, 185, 129, 0.25)'
                          : 'var(--bg-input)',
                        color: selectedBuilding.areaType === 'playground' ? '#34d399' : '#94a3b8',
                        fontWeight: selectedBuilding.areaType === 'playground' ? 700 : 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Plac zabaw
                    </button>
                  </div>
                </div>

                {selectedBuilding.areaType === 'playground' ? (
                  /* Plac zabaw (§ 33.3) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>Powierzchnia placu zabaw:</span>
                        <b style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
                          {selectedBuildingArea.toFixed(1)} m²
                        </b>
                      </div>
                    </div>

                    {/* Przelicznik pojemności mieszkań wg § 33 ust. 8 WT */}
                    {(() => {
                      const capacity = computePlaygroundApartmentCapacity(selectedBuildingArea);
                      return (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(15, 23, 42, 0.65)',
                            border: '1px solid rgba(51, 65, 85, 0.5)',
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#94a3b8' }}>Chłonność (§ 33.8 WT):</span>
                            <b style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                              {capacity.displayText}
                            </b>
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            {capacity.tierDescription}
                          </div>
                          <div style={{ fontSize: '9.5px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px' }}>
                            {capacity.details}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Wynik analizy nasłonecznienia placu zabaw wg § 33.3 */}
                    {selectedBuilding.isTested && playgroundAnalysis && (
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          backgroundColor: playgroundAnalysis.isCompliant
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(239, 68, 68, 0.12)',
                          border: playgroundAnalysis.isCompliant
                            ? '1px solid rgba(16, 185, 129, 0.4)'
                            : '1px solid rgba(239, 68, 68, 0.4)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            § 33 ust. 3 WT (Plac zabaw)
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: playgroundAnalysis.isCompliant ? '#34d399' : '#fca5a5',
                            }}
                          >
                            {playgroundAnalysis.isCompliant ? 'SPEŁNIONY' : 'NIESPEŁNIONY'}
                          </span>
                        </div>

                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Silnik: <b style={{ color: '#cbd5e1' }}>{sunlightMethod === 'segments' ? 'Linijka Słońca (Geometryczny)' : 'Astronomiczny (Astro)'}</b>
                        </div>

                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Wymóg: <b style={{ color: '#cbd5e1' }}>min. {playgroundAnalysis.requiredDurationHours}h na ≥ 50% pow. (okno 8h równonocy)</b>
                        </div>

                        {/* Pasek postępu procentowego */}
                        <div style={{ marginTop: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '10px' }}>
                            <span style={{ color: '#cbd5e1' }}>Nasłonecznienie:</span>
                            <b style={{ color: playgroundAnalysis.isCompliant ? '#34d399' : '#fca5a5', fontFamily: 'monospace' }}>
                              {playgroundAnalysis.sunlitPercentage}% ({playgroundAnalysis.compliantSamplePoints}/{playgroundAnalysis.totalSamplePoints} pkt)
                            </b>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '6px',
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              border: '1px solid rgba(51, 65, 85, 0.5)',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(100, playgroundAnalysis.sunlitPercentage)}%`,
                                height: '100%',
                                backgroundColor: playgroundAnalysis.isCompliant ? '#10b981' : '#ef4444',
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Przełącznik: Diagram Voronoi vs Siatka regularna */}
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedBuilding({
                          playgroundVoronoi: selectedBuilding.playgroundVoronoi === false ? true : false,
                        })
                      }
                      className={`btn-tile ${selectedBuilding.playgroundVoronoi !== false ? 'active-indigo' : 'inactive'}`}
                      style={{ justifyContent: 'space-between', padding: '6px 8px', fontSize: '11px' }}
                      title="Włącz diagram komórek Voronoi lub siatkę ortogonalną"
                    >
                      <span style={{ fontWeight: 600 }}>Diagram Voronoi</span>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>
                        {selectedBuilding.playgroundVoronoi !== false ? 'WŁ (Voronoi)' : 'WYŁ (Siatka)'}
                      </span>
                    </button>

                    {/* Sekcja testowa parametrów gęstości siatki Voronoi */}
                    {selectedBuilding.playgroundVoronoi !== false && (
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a5b4fc' }}>
                            Gęstość Voronoi (faza testowa)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedBuilding({
                                playgroundParams: undefined,
                              })
                            }
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              fontSize: '10px',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              padding: 0,
                            }}
                            title="Przywróć domyślne parametry gęstości"
                          >
                            Domyślne
                          </button>
                        </div>

                        {/* Krok makro (bazowy) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1' }}>
                            <span>Krok bazowy (makro):</span>
                            <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
                              {(selectedBuilding.playgroundParams?.baseStep ?? 4.5).toFixed(1)} m
                            </b>
                          </div>
                          <input
                            type="range"
                            min="1.0"
                            max="15.0"
                            step="0.5"
                            value={selectedBuilding.playgroundParams?.baseStep ?? 4.5}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                playgroundParams: {
                                  ...selectedBuilding.playgroundParams,
                                  baseStep: parseFloat(e.target.value),
                                },
                              })
                            }
                            style={{ width: '100%', accentColor: '#818cf8' }}
                          />
                        </div>

                        {/* Zagęszczenie stref granicznych (maks punktów) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1' }}>
                            <span>Maks. punktów zagęszczających:</span>
                            <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
                              {selectedBuilding.playgroundParams?.maxExtraPoints ?? 15}
                            </b>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="120"
                            step="5"
                            value={selectedBuilding.playgroundParams?.maxExtraPoints ?? 15}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                playgroundParams: {
                                  ...selectedBuilding.playgroundParams,
                                  maxExtraPoints: parseInt(e.target.value, 10),
                                },
                              })
                            }
                            style={{ width: '100%', accentColor: '#818cf8' }}
                          />
                        </div>

                        {/* Minimalna odległość podziału */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1' }}>
                            <span>Min. rozmiar komórki:</span>
                            <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
                              {(selectedBuilding.playgroundParams?.minSubdivDist ?? 1.5).toFixed(1)} m
                            </b>
                          </div>
                          <input
                            type="range"
                            min="0.3"
                            max="4.0"
                            step="0.2"
                            value={selectedBuilding.playgroundParams?.minSubdivDist ?? 1.5}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                playgroundParams: {
                                  ...selectedBuilding.playgroundParams,
                                  minSubdivDist: parseFloat(e.target.value),
                                },
                              })
                            }
                            style={{ width: '100%', accentColor: '#818cf8' }}
                          />
                        </div>

                        {/* Próg podziału przejścia słońce/cień */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#cbd5e1' }}>
                            <span>Czułość przejścia (próg Δh):</span>
                            <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
                              {(selectedBuilding.playgroundParams?.hoursDeltaThreshold ?? 0.75).toFixed(2)} h
                            </b>
                          </div>
                          <input
                            type="range"
                            min="0.10"
                            max="2.00"
                            step="0.10"
                            value={selectedBuilding.playgroundParams?.hoursDeltaThreshold ?? 0.75}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                playgroundParams: {
                                  ...selectedBuilding.playgroundParams,
                                  hoursDeltaThreshold: parseFloat(e.target.value),
                                },
                              })
                            }
                            style={{ width: '100%', accentColor: '#818cf8' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Działka */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Numer działki</label>
                      <input
                        type="text"
                        placeholder="np. 124/2"
                        value={selectedBuilding.plotNumber || ''}
                        onChange={(e) => updateSelectedBuilding({ plotNumber: e.target.value })}
                        style={{
                          width: '110px',
                          backgroundColor: 'var(--bg-input)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          color: '#fca5a5',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          textAlign: 'right',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>Powierzchnia działki:</span>
                        <b style={{ color: '#fca5a5', fontFamily: 'monospace' }}>
                          {selectedBuildingArea.toFixed(1)} m² ({(selectedBuildingArea / 100).toFixed(2)} a)
                        </b>
                      </div>
                      <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                        • Obrys geodezyjny (nie generuje cienia i kierunków śledzenia fasad).
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Wysokość H (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedBuilding.defaultHeight}
                    onChange={(e) => updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '80px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textAlign: 'right',
                    }}
                  />
                </div>

                {/* Posadowienie / Rzędna dolnej krawędzi Hbase */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>Posadowienie H_base (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedBuilding.elevation ?? 0}
                    onChange={(e) => updateSelectedBuilding({ elevation: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '80px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textAlign: 'right',
                    }}
                  />
                </div>

                {/* Parametry Wstęgi (jeśli obiekt został utworzony jako Wstęga) */}
                {selectedBuilding.sweepPath && selectedBuilding.sweepPath.length >= 2 && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ color: '#38bdf8', fontWeight: 600, fontSize: '11px' }}>
                      Parametry Wstęgi (Sweep)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Szerokość (m)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={selectedBuilding.sweepWidth ?? 6.0}
                        onChange={(e) => updateSelectedBuilding({ sweepWidth: parseFloat(e.target.value) || 1.0 })}
                        style={{
                          width: '70px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '5px',
                          padding: '4px 6px',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '10.5px', color: '#94a3b8' }}>Wyrównanie</label>
                      <div style={{ display: 'flex', gap: '2px', backgroundColor: 'var(--bg-input)', padding: '2px', borderRadius: '5px', border: '1px solid var(--border-light)' }}>
                        <button
                          type="button"
                          onClick={() => updateSelectedBuilding({ sweepAlignment: 'center' })}
                          style={{
                            padding: '2px 5px',
                            fontSize: '9.5px',
                            fontWeight: (selectedBuilding.sweepAlignment || 'center') === 'center' ? 700 : 500,
                            borderRadius: '3px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: (selectedBuilding.sweepAlignment || 'center') === 'center' ? '#38bdf8' : 'transparent',
                            color: (selectedBuilding.sweepAlignment || 'center') === 'center' ? '#0f172a' : '#94a3b8',
                          }}
                        >
                          Oś
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedBuilding({ sweepAlignment: 'left' })}
                          style={{
                            padding: '2px 5px',
                            fontSize: '9.5px',
                            fontWeight: selectedBuilding.sweepAlignment === 'left' ? 700 : 500,
                            borderRadius: '3px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: selectedBuilding.sweepAlignment === 'left' ? '#38bdf8' : 'transparent',
                            color: selectedBuilding.sweepAlignment === 'left' ? '#0f172a' : '#94a3b8',
                          }}
                        >
                          Lewo
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedBuilding({ sweepAlignment: 'right' })}
                          style={{
                            padding: '2px 5px',
                            fontSize: '9.5px',
                            fontWeight: selectedBuilding.sweepAlignment === 'right' ? 700 : 500,
                            borderRadius: '3px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: selectedBuilding.sweepAlignment === 'right' ? '#38bdf8' : 'transparent',
                            color: selectedBuilding.sweepAlignment === 'right' ? '#0f172a' : '#94a3b8',
                          }}
                        >
                          Prawo
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Kondygnacje: H1 = 3.0m, Ht = 3.0m domyślnie */}
                {(() => {
                  const h1 = selectedBuilding.firstFloorHeight ?? 3.0;
                  const ht = selectedBuilding.typicalFloorHeight ?? 3.0;
                  const floorCalc = calculateBuildingFloors(selectedBuilding.defaultHeight, h1, ht, selectedBuilding.elevation ?? 0.0);

                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', backgroundColor: 'var(--bg-input)', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Wys. parteru H₁</label>
                          <input
                            type="number"
                            step="0.1"
                            value={h1}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 3.0;
                              updateSelectedBuilding({ firstFloorHeight: val });
                            }}
                            style={{
                              width: '100%',
                              backgroundColor: 'transparent',
                              border: '1px solid #475569',
                              borderRadius: '5px',
                              padding: '4px 6px',
                              color: '#cbd5e1',
                              fontSize: '11px',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Kond. typowa Hₜ</label>
                          <input
                            type="number"
                            step="0.05"
                            value={ht}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 3.0;
                              updateSelectedBuilding({ typicalFloorHeight: val });
                            }}
                            style={{
                              width: '100%',
                              backgroundColor: 'transparent',
                              border: '1px solid #475569',
                              borderRadius: '5px',
                              padding: '4px 6px',
                              color: '#cbd5e1',
                              fontSize: '11px',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                      </div>

                      {/* Automatyczna liczba kondygnacji (cyfry rzymskie) + Attyka */}
                      <div
                        style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.75)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Liczba kondygnacji:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: '#38bdf8',
                                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                letterSpacing: '0.05em',
                              }}
                              title={`Liczba kondygnacji pełnych: ${floorCalc.storeysCount}`}
                            >
                              {floorCalc.storeysRoman} ({floorCalc.storeysCount})
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: '#94a3b8' }}>Wysokość attyki (Hₐ):</span>
                          <span
                            style={{
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              color: floorCalc.atticHeight > 0.001 ? '#fbbf24' : '#64748b',
                            }}
                          >
                            {floorCalc.atticHeight.toFixed(2)} m
                          </span>
                        </div>

                        <div style={{ fontSize: '9.5px', color: '#64748b', borderTop: '1px dashed #334155', paddingTop: '4px' }}>
                          H = {h1.toFixed(2)}m (parter) + {floorCalc.storeysCount > 1 ? `${floorCalc.storeysCount - 1}×${ht.toFixed(2)}m` : '0m'} + {floorCalc.atticHeight.toFixed(2)}m (attyka) = <b>{selectedBuilding.defaultHeight.toFixed(2)}m</b>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {(() => {
                  const currentRotDeg = selectedBuilding.transform?.rotationDeg !== undefined
                    ? selectedBuilding.transform.rotationDeg
                    : selectedBuilding.segments.length > 0
                    ? Number((((selectedBuilding.segments[0].angleRad * 180) / Math.PI + 360) % 360).toFixed(1))
                    : 0;

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        Obrót (°)
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={currentRotDeg}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleSetBuildingAbsoluteRotation(selectedBuilding.id, val);
                        }}
                        style={{
                          width: '80px',
                          backgroundColor: 'var(--bg-input)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          color: '#818cf8',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  );
                })()}

                {distancesToBoundaries.length > 0 && (
                  <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', fontSize: '10.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ color: '#fca5a5', fontWeight: 600 }}>Odległość od granicy działki:</div>
                    {distancesToBoundaries.map((d) => (
                      <div key={d.boundaryId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#cbd5e1' }}>{d.boundaryName}:</span>
                        <b style={{ color: d.minDistance < 3.0 ? '#f43f5e' : d.minDistance < 4.0 ? '#fbbf24' : '#6ee7b7', fontFamily: 'monospace' }}>
                          {d.minDistance.toFixed(2)} m
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zunifikowany blok 3 przełączników obok siebie dla WSZYSTKICH typów obiektów */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => updateSelectedBuilding({ isIncluded: selectedBuilding.isIncluded === false ? true : false })}
                className={`btn-tile ${selectedBuilding.isIncluded !== false ? 'active-emerald' : 'inactive'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  minHeight: '48px',
                }}
                title="Uwzględnij obiekt w kalkulacjach nasłonecznienia i przesłaniania"
              >
                <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Uwzględnij w kalkulacji</span>
                <span style={{ fontSize: '9.5px', fontWeight: 700 }}>{selectedBuilding.isIncluded !== false ? 'TAK' : 'NIE'}</span>
              </button>

              <button
                type="button"
                onClick={() => updateSelectedBuilding({ isTested: !selectedBuilding.isTested })}
                className={`btn-tile ${selectedBuilding.isTested ? 'active-indigo' : 'inactive'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  minHeight: '48px',
                }}
                title="Oznacz obiekt jako badany (projektowany)"
              >
                <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Obiekt badany</span>
                <span style={{ fontSize: '9.5px', fontWeight: 700 }}>{selectedBuilding.isTested ? 'TAK' : 'NIE'}</span>
              </button>

              <button
                type="button"
                onClick={() => updateSelectedBuilding({ isCityCentre: !selectedBuilding.isCityCentre })}
                className={`btn-tile ${selectedBuilding.isCityCentre ? 'active-amber' : 'inactive'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  padding: '6px 4px',
                  textAlign: 'center',
                  minHeight: '48px',
                }}
                title="Włącz normę zabudowy śródmiejskiej dla obiektu"
              >
                <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Zabudowa śródmiejska</span>
                <span style={{ fontSize: '9.5px', fontWeight: 700 }}>{selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ui-card" style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
          Kliknij dowolny obiekt na rzucie CAD, aby edytować jego parametry.
        </div>
      )}

      {/* 2.2 Kafelek Informacyjny: Bilans Powierzchni & Kubatury */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Informacje i bilans powierzchni</span>
          <FileSpreadsheet size={14} color="#10b981" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
          {selectedBuilding && selectedBuilding.category !== 'boundary' && (() => {
            const pz = selectedBuildingArea;
            const n = selectedBuilding.storeysCount || (selectedBuilding.defaultHeight > (selectedBuilding.firstFloorHeight ?? 3.0) ? 1 + Math.max(1, Math.round((selectedBuilding.defaultHeight - (selectedBuilding.firstFloorHeight ?? 3.0)) / (selectedBuilding.typicalFloorHeight ?? 3.0))) : 1);
              const pc = pz * n;
              const vol = pz * selectedBuilding.defaultHeight;
              const pum = pc * 0.70;

              return (
                <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontWeight: 700, color: '#e0e7ff', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Wybrany: {selectedBuilding.name}</span>
                    <span style={{ color: '#38bdf8' }}>{n} kond.</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Powierzchnia zabudowy (Pz):</span>
                    <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{Math.round(pz)} m²</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Powierzchnia całkowita (Pc):</span>
                    <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{Math.round(pc)} m²</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Kubatura brutto (V):</span>
                    <b style={{ color: '#c084fc', fontFamily: 'monospace' }}>{Math.round(vol)} m³</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Szacowany PUM (~70%):</span>
                    <b style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{Math.round(pum)} m²</b>
                  </div>
                </div>
              );
            })()}

            {/* Sekcja Podsumowania Budynków Projektowanych */}
            <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontWeight: 700, color: '#a5b4fc', marginBottom: '2px' }}>
                Łącznie obiekty badane ({testedBuildingsSummary.count} szt.)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Łączna pow. zabudowy (Pz):</span>
                <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPz)} m²</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Łączna pow. całkowita (Pc):</span>
                <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalPc)} m²</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Łączna kubatura (V):</span>
                <b style={{ color: '#c084fc', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.totalVolume)} m³</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Łączny szacowany PUM:</span>
                <b style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{Math.round(testedBuildingsSummary.estimatedPUM)} m²</b>
              </div>
            </div>

            {/* Sekcja Działek i Wskaźników Urbanistycznych */}
            <div style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: '2px' }}>
                Działki ewidencyjne ({boundaryObjects.length} szt.
                {testedBoundaryObjects.length > 0 ? `, w tym ${testedBoundaryObjects.length} badane` : ''})
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Pow. działki badanej (Pdz):</span>
                <b style={{ color: '#fca5a5', fontFamily: 'monospace' }}>
                  {totalBoundaryArea > 0 ? `${Math.round(totalBoundaryArea)} m² (${(totalBoundaryArea / 100).toFixed(2)} a)` : 'Brak zdefiniowanych działek'}
                </b>
              </div>
              {totalBoundaryArea > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Wskaźnik pow. zabudowy:</span>
                    <b style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{testedBuildingsSummary.plotCoverageRatio.toFixed(1)}%</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Wskaźnik intensywności:</span>
                    <b style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{testedBuildingsSummary.intensityRatio.toFixed(2)}</b>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const lines: string[] = [
                  '=== ZESTAWIENIE POWIERZCHNI I KUBATURY ===',
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

                navigator.clipboard.writeText(lines.join('\n')).then(() => {
                  showCopiedToast('Skopiowano zestawienie do schowka!');
                }).catch(() => {
                  showCopiedToast('Nie udało się skopiować.');
                });
              }}
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
                color: '#6ee7b7',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                padding: '4px',
                borderRadius: '4px',
                border: '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              {copiedToast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
