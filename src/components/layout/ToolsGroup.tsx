import React, { useMemo, useState } from 'react';
import {
  Wrench,
  Magnet,
  Compass,
  Square,
  PenTool,
  RotateCw,
  Edit3,
  Maximize2,
  Combine,
  Ruler,
  MapPin,
  Trash2,
  Copy,
  Link,
  Link2,
  Unlink,
  Layers,
  Plus,
  Sliders,
} from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';
import { computeLinearDimension, computeAngularDimension } from '@/utils/math2d';
import { analyzeSegmentsStatistics } from '../../utils/segmentStatistics';
import { APP_CONFIG } from '../../config/appConfig';

export const ToolsGroup: React.FC = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const duplicateBuilding = useSceneStore((s) => s.duplicateBuilding);
  const deleteBuilding = useSceneStore((s) => s.deleteBuilding);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const setIsLinkingMode = useSceneStore((s) => s.setIsLinkingMode);
  const setLinkingSourceId = useSceneStore((s) => s.setLinkingSourceId);
  const performUnlinkBuilding = useSceneStore((s) => s.performUnlinkBuilding);
  const addBuildingModifier = useSceneStore((s) => s.addBuildingModifier);
  const toggleBuildingModifier = useSceneStore((s) => s.toggleBuildingModifier);
  const removeBuildingModifier = useSceneStore((s) => s.removeBuildingModifier);

  const showModifiersPanel = useCadToolStore((s) => s.showModifiersPanel);
  const setShowModifiersPanel = useCadToolStore((s) => s.setShowModifiersPanel);
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const toggleDirectionSnapping = useCadToolStore((s) => s.toggleDirectionSnapping);

  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const drawingVerticesCount = useCadToolStore((s) => s.drawingVerticesCount);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const setRotateInitialBuildingsSnapshot = useCadToolStore((s) => s.setRotateInitialBuildingsSnapshot);

  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);

  const dimensions = useCadToolStore((s) => s.dimensions);
  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const dimensionType = useCadToolStore((s) => s.dimensionType);
  const setDimensionType = useCadToolStore((s) => s.setDimensionType);
  const dimensionPendingRef = useCadToolStore((s) => s.dimensionPendingRef);
  const cancelDimension = useCadToolStore((s) => s.cancelDimension);
  const deleteDimension = useCadToolStore((s) => s.deleteDimension);
  const toggleDimensionType = useCadToolStore((s) => s.toggleDimensionType);
  const clearAllDimensions = useCadToolStore((s) => s.clearAllDimensions);

  // Selected building object
  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  // Dimensions connected to selected building only
  const selectedBuildingDimensions = useMemo(() => {
    if (!selectedBuildingId) return [];
    return dimensions.filter(
      (d) => d.ref1.buildingId === selectedBuildingId || d.ref2?.buildingId === selectedBuildingId
    );
  }, [dimensions, selectedBuildingId]);

  // Statistical analysis of facade segments directions
  const [noisePercentileCutoff, setNoisePercentileCutoff] = useState<number>(
    APP_CONFIG.statistics?.defaultNoisePercentile ?? 20
  );
  const segmentStats = useMemo(
    () => analyzeSegmentsStatistics(buildings, { noisePercentileCutoff }),
    [buildings, noisePercentileCutoff]
  );

  return (
    <div className="sidebar-group-content">
      {/* 3.1 Narzędzia Rysowania i Edycji */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Narzędzia</span>
          <Wrench size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {/* Rząd przełączników: Dociąganie oraz Śledzenie */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px', marginBottom: '4px' }}>
            <button
              type="button"
              onClick={toggleOsnap}
              className={`btn-tile ${isOsnapActive ? 'active-emerald' : 'inactive'}`}
              style={{ padding: '7px 8px', justifyContent: 'space-between' }}
              title="Włącz / wyłącz dociąganie geometryczne [F3] (wierzchołki, środki, krawędzie, przecięcia OTRACK)"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Magnet size={13} color={isOsnapActive ? '#10b981' : '#64748b'} />
                <span style={{ fontWeight: 600, fontSize: '11px' }}>Dociąganie [F3]</span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700 }}>
                {isOsnapActive ? 'WŁ' : 'WYŁ'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleDirectionSnapping}
              className={`btn-tile ${isDirectionSnappingActive ? 'active-indigo' : 'inactive'}`}
              style={{ padding: '7px 8px', justifyContent: 'space-between' }}
              title="Włącz / wyłącz inteligentne śledzenie kątowe i kierunków"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Compass size={13} color={isDirectionSnappingActive ? '#818cf8' : '#64748b'} />
                <span style={{ fontWeight: 600, fontSize: '11px' }}>Śledzenie</span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700 }}>
                {isDirectionSnappingActive ? 'WŁ' : 'WYŁ'}
              </span>
            </button>
          </div>

          {/* Rząd 1: Prostokąt, Polilinia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
            <button
              type="button"
              onClick={() => {
                setDrawingMode(drawingMode === 'rectangle' ? 'none' : 'rectangle');
                setDrawingVerticesCount(0);
                setIsDimensionToolActive(false);
                setFacadePointMode(false);
              }}
              className={`btn-tile ${drawingMode === 'rectangle' ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
              title="Rysuj nowy prostokąt"
            >
              <Square size={13} />
              <span style={{ fontWeight: 600 }}>Prostokąt</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawingMode(drawingMode === 'polyline' ? 'none' : 'polyline');
                setDrawingVerticesCount(0);
                setIsDimensionToolActive(false);
                setFacadePointMode(false);
              }}
              className={`btn-tile ${drawingMode === 'polyline' ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
              title="Rysuj nową polilinię"
            >
              <PenTool size={13} />
              <span style={{ fontWeight: 600 }}>Polilinia</span>
            </button>
          </div>

          {/* Rząd 2: Obrót, Wierzchołki, Krawędzie, Suma */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
            <button
              type="button"
              onClick={() => {
                if (drawingMode === 'rotate') {
                  setRotateInitialBuildingsSnapshot(null);
                  setDrawingMode('none');
                } else {
                  setRotateInitialBuildingsSnapshot(
                    buildings.map((b) => ({ ...b, vertices: [...b.vertices], segments: [...b.segments] }))
                  );
                  setDrawingMode('rotate');
                  setDrawingVerticesCount(0);
                  setIsDimensionToolActive(false);
                  setFacadePointMode(false);
                  setIsEditMode(false);
                }
              }}
              className={`btn-tile ${drawingMode === 'rotate' ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Obrót obiektów"
            >
              <RotateCw size={13} />
              <span style={{ fontWeight: 600 }}>Obrót</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawingMode(drawingMode === 'vertexEdit' ? 'none' : 'vertexEdit');
                setDrawingVerticesCount(0);
                setIsDimensionToolActive(false);
                setFacadePointMode(false);
              }}
              className={`btn-tile ${drawingMode === 'vertexEdit' ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Edycja wierzchołków brył"
            >
              <Edit3 size={13} />
              <span style={{ fontWeight: 600 }}>Wierzchołki</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsEditMode(!isEditMode);
                setDrawingMode('none');
                setDrawingVerticesCount(0);
                setIsDimensionToolActive(false);
                setFacadePointMode(false);
              }}
              className={`btn-tile ${isEditMode ? 'active-amber' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Równoległe przesuwanie krawędzi (offset)"
            >
              <Maximize2 size={13} />
              <span style={{ fontWeight: 600 }}>Krawędzie</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawingMode(drawingMode === 'union' ? 'none' : 'union');
                setDrawingVerticesCount(0);
                setIsDimensionToolActive(false);
                setFacadePointMode(false);
                setIsEditMode(false);
              }}
              className={`btn-tile ${drawingMode === 'union' ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Suma (Boolean Union)"
            >
              <Combine size={13} />
              <span style={{ fontWeight: 600 }}>Suma</span>
            </button>
          </div>

          {/* Rząd 3: Wymiar, Punkt fasady */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
            <button
              type="button"
              onClick={() => {
                setIsDimensionToolActive(!isDimensionToolActive);
                setDrawingMode('none');
                setDrawingVerticesCount(0);
                setFacadePointMode(false);
              }}
              className={`btn-tile ${isDimensionToolActive ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
              title="Dodaj wymiar: kliknij 1. i 2. krawędź"
            >
              <Ruler size={13} />
              <span style={{ fontWeight: 600 }}>Wymiar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFacadePointMode(!facadePointMode);
                setDrawingMode('none');
                setIsDimensionToolActive(false);
              }}
              className={`btn-tile ${facadePointMode ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '5px', padding: '8px 6px', fontSize: '11px' }}
              title="Kliknij lub przeciągnij punkt fasady"
            >
              <MapPin size={13} />
              <span style={{ fontWeight: 600 }}>Punkt fasady</span>
            </button>
          </div>

          {/* Active Dimension Tool Panel */}
          {isDimensionToolActive && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Ruler size={13} />
                  <span>Narzędzie Wymiar</span>
                </span>

                <div style={{ display: 'flex', gap: '3px', backgroundColor: 'var(--bg-input)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                  <button
                    type="button"
                    onClick={() => setDimensionType('linear')}
                    style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: dimensionType === 'linear' ? 700 : 500,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: dimensionType === 'linear' ? '#38bdf8' : 'transparent',
                      color: dimensionType === 'linear' ? '#0f172a' : '#94a3b8',
                    }}
                  >
                    Liniowy
                  </button>
                  <button
                    type="button"
                    onClick={() => setDimensionType('angular')}
                    style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: dimensionType === 'angular' ? 700 : 500,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: dimensionType === 'angular' ? '#c084fc' : 'transparent',
                      color: dimensionType === 'angular' ? '#0f172a' : '#94a3b8',
                    }}
                  >
                    Kątowy
                  </button>
                </div>
              </div>

              <div style={{ color: '#cbd5e1', fontSize: '10.5px' }}>
                {!dimensionPendingRef
                  ? '1. Kliknij w 1. krawędź obiektu na rzucie CAD.'
                  : '2. Kliknij w 2. krawędź obiektu.'}
              </div>

              <button
                type="button"
                onClick={cancelDimension}
                style={{
                  marginTop: '2px',
                  padding: '4px 8px',
                  borderRadius: '5px',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  backgroundColor: 'rgba(244, 63, 94, 0.15)',
                  color: '#fca5a5',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Anuluj wymiarowanie (Esc)
              </button>
            </div>
          )}

          {/* Active Dimensions List for Selected Building */}
          {selectedBuildingDimensions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>
                <span>Wymiary obiektu ({selectedBuildingDimensions.length}):</span>
                <button
                  type="button"
                  onClick={clearAllDimensions}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f43f5e',
                    fontSize: '10px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  title="Wyczyść wszystkie wymiary"
                >
                  Wyczyść
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {selectedBuildingDimensions.map((dim, idx) => {
                  const b1 = buildings.find((b) => b.id === dim.ref1.buildingId);
                  const s1 = b1?.segments.find((s) => s.id === dim.ref1.segmentId);
                  const b2 = buildings.find((b) => b.id === dim.ref2.buildingId);
                  const s2 = b2?.segments.find((s) => s.id === dim.ref2.segmentId);
                  let valStr = '...';
                  if (s1 && s2) {
                    if (dim.type === 'linear') {
                      const r = computeLinearDimension(s1.p1, s1.p2, s2.p1, s2.p2);
                      valStr = `${r.distance.toFixed(2)} m`;
                    } else {
                      const r = computeAngularDimension(s1.p1, s1.p2, s2.p1, s2.p2);
                      valStr = `${r.angleDeg.toFixed(1)}°`;
                    }
                  }

                  return (
                    <div
                      key={dim.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid var(--border-light)',
                        fontSize: '11px',
                      }}
                    >
                      <span style={{ color: dim.type === 'linear' ? '#38bdf8' : '#c084fc', fontWeight: 700, fontFamily: 'monospace' }}>
                        #{idx + 1} {valStr}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => toggleDimensionType(dim.id)}
                          style={{
                            padding: '2px 5px',
                            fontSize: '9.5px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            backgroundColor: 'transparent',
                            color: '#94a3b8',
                            cursor: 'pointer',
                          }}
                          title="Przełącz typ wymiaru"
                        >
                          {dim.type === 'linear' ? 'm' : '°'}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteDimension(dim.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f43f5e',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Usuń ten wymiar"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Operations on Selected Building */}
          {selectedBuilding && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => duplicateBuilding(selectedBuilding.id)}
                  className="btn-tile active-indigo"
                  style={{ justifyContent: 'center', gap: '6px', padding: '8px 10px' }}
                  title="Utwórz kopię tego obiektu"
                >
                  <Copy size={13} />
                  <span style={{ fontWeight: 600 }}>Duplikuj</span>
                </button>

                <button
                  type="button"
                  onClick={() => deleteBuilding(selectedBuilding.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    color: '#fca5a5',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                  title="Usuń ten obiekt ze sceny"
                >
                  <Trash2 size={13} />
                  <span>Usuń</span>
                </button>
              </div>

              {/* Linking / Grouping */}
              {isLinkingMode ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Link2 size={14} />
                    <span>Tryb łączenia aktywny</span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '10.5px' }}>
                    Kliknij <b>drugi obiekt</b> na rzucie CAD, aby go połączyć z <b>{selectedBuilding.name}</b>.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkingMode(false);
                      setLinkingSourceId(null);
                    }}
                    style={{
                      marginTop: '4px',
                      padding: '4px 8px',
                      borderRadius: '5px',
                      border: '1px solid rgba(244, 63, 94, 0.4)',
                      backgroundColor: 'rgba(244, 63, 94, 0.15)',
                      color: '#fca5a5',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Anuluj łączenie
                  </button>
                </div>
              ) : selectedBuilding.groupId ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Link size={13} />
                    <span>Połączony w grupie</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLinkingMode(true);
                        setLinkingSourceId(selectedBuilding.id);
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid #38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.2)',
                        color: '#e0f2fe',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Link2 size={12} />
                      <span>Dołącz kolejny</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => performUnlinkBuilding(selectedBuilding.id)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(244, 63, 94, 0.4)',
                        backgroundColor: 'rgba(244, 63, 94, 0.15)',
                        color: '#fca5a5',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Unlink size={12} />
                      <span>Rozłącz obiekt</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsLinkingMode(true);
                    setLinkingSourceId(selectedBuilding.id);
                  }}
                  className="btn-tile active-indigo"
                  style={{ justifyContent: 'center', gap: '8px', padding: '9px 12px' }}
                >
                  <Link2 size={14} />
                  <span style={{ fontWeight: 600 }}>Połącz z innym obiektem</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3.2 Kafel Modyfikatory 2.5D */}
      <div className="ui-card">
        <div className="ui-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Modyfikatory</span>
            {selectedBuilding && (
              <span
                style={{
                  fontSize: '9.5px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor:
                    (selectedBuilding.modifiers?.length || 0) > 0
                      ? 'rgba(168, 85, 247, 0.25)'
                      : 'rgba(255, 255, 255, 0.08)',
                  color: (selectedBuilding.modifiers?.length || 0) > 0 ? '#c084fc' : '#94a3b8',
                  fontWeight: 700,
                }}
              >
                {selectedBuilding.modifiers?.length || 0}
              </span>
            )}
          </div>
          <Layers size={14} color="#a855f7" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {selectedBuilding ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const newMod = {
                      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                      type: 'story_offset' as const,
                      enabled: true,
                      distance: -2.0,
                      storiesCount: -1,
                    };
                    addBuildingModifier(selectedBuilding.id, newMod);
                    setShowModifiersPanel(true);
                  }}
                  className="btn-tile active-indigo"
                  style={{ justifyContent: 'center', gap: '5px', padding: '7px 6px', fontSize: '11px' }}
                  title="Dodaj modyfikator uskoku kondygnacji"
                >
                  <Plus size={13} color="#c084fc" />
                  <span style={{ fontWeight: 600 }}>+ Uskok</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowModifiersPanel((prev) => !prev)}
                  className={`btn-tile ${showModifiersPanel ? 'active-indigo' : 'inactive'}`}
                  style={{ justifyContent: 'center', gap: '5px', padding: '7px 6px', fontSize: '11px' }}
                  title="Otwórz boczny panel modyfikatorów"
                >
                  <Sliders size={13} color={showModifiersPanel ? '#c084fc' : '#64748b'} />
                  <span style={{ fontWeight: 600 }}>{showModifiersPanel ? 'Panel WŁ' : 'Inspektor'}</span>
                </button>
              </div>

              {/* Quick list of modifiers */}
              {selectedBuilding.modifiers && selectedBuilding.modifiers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                  {selectedBuilding.modifiers.map((m, idx) => {
                    const offMod = m as any;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: m.enabled ? 'rgba(168, 85, 247, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                          border: `1px solid ${m.enabled ? 'rgba(168, 85, 247, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
                          fontSize: '10.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={() => toggleBuildingModifier(selectedBuilding.id, m.id)}
                            style={{ cursor: 'pointer', accentColor: '#a855f7' }}
                          />
                          <span style={{ color: m.enabled ? '#f3e8ff' : '#94a3b8', fontWeight: 600 }}>
                            #{idx + 1} {offMod.distance > 0 ? `+${offMod.distance}m` : `${offMod.distance}m`} (
                            {offMod.storiesCount < 0 ? `${offMod.storiesCount} góra` : `+${offMod.storiesCount} dół`})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBuildingModifier(selectedBuilding.id, m.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fb7185',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                          title="Usuń modyfikator"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '10.5px', color: '#94a3b8', textAlign: 'center', padding: '4px 0' }}>
                  Brak modyfikatorów na obiekcie.
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '10.5px', color: '#94a3b8', textAlign: 'center', padding: '6px 0' }}>
              Zaznacz budynek na scenie, aby zarządzać modyfikatorami.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
