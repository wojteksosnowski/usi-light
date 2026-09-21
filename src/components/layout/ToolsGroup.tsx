import React, { useMemo, useState } from 'react';
import {
  Wrench,
  Magnet,
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
  Paintbrush,
} from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';
import { computeLinearDimension, computeAngularDimension } from '@/utils/math2d';
import { analyzeSegmentsStatistics } from '../../utils/segmentStatistics';
import { APP_CONFIG } from '../../config/appConfig';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { MODIFIER_DESCRIPTORS } from '../modifiers/modifierDescriptors';
import { ModifierType } from '../../types/modifiers';
import { DRAWING_TOOLS } from '../toolbar/drawingToolDescriptors';
import { useStableWhileInteracting } from '@/hooks/useStableWhileInteracting';

import { SnappingToolsCard } from './tools/SnappingToolsCard';

const ALIGN_TOOL = DRAWING_TOOLS.find((t) => t.mode === 'align')!;

/** Układ przycisków "dodaj modyfikator" — jeden wiersz = jeden rząd siatki w kolejności deklaracji. */
const ADD_MODIFIER_ROWS: ModifierType[][] = [
  ['story_offset', 'terrace', 'donut'],
  ['gate', 'bay_window', 'corner_cut'],
  ['sztyca', 'pila', 'zone_function'],
];

/** Modyfikatory obszarów (działają też na obiektach kategorii 'boundary') — osobna sekcja w toolbarze. */
const AREA_MODIFIER_ROWS: ModifierType[][] = [['zone_offset']];

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
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);

  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const drawingVerticesCount = useCadToolStore((s) => s.drawingVerticesCount);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const cancelAlign = useCadToolStore((s) => s.cancelAlign);
  const sweepWidth = useCadToolStore((s) => s.sweepWidth);
  const setSweepWidth = useCadToolStore((s) => s.setSweepWidth);
  const sweepAlignment = useCadToolStore((s) => s.sweepAlignment);
  const setSweepAlignment = useCadToolStore((s) => s.setSweepAlignment);

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

  const isProjectBrushActive = useCadToolStore((s) => s.isProjectBrushActive);
  const setIsProjectBrushActive = useCadToolStore((s) => s.setIsProjectBrushActive);

  const isInteracting = useCadToolStore((s) => s.isInteracting);

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
  const rawSegmentStats = useMemo(
    () => analyzeSegmentsStatistics(buildings, { viewAngleDeg: viewRotationDeg }),
    [buildings, viewRotationDeg]
  );
  const segmentStats = useStableWhileInteracting(rawSegmentStats, isInteracting);

  return (
    <div className="sidebar-group-content">
      {/* 3.0 Kafel Dociągania (OSNAP / OTRACK / HPF) */}
      <SnappingToolsCard />

      {/* 3.1 Narzędzia Rysowania i Edycji */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Narzędzia</span>
          <Wrench size={14} color="#818cf8" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {/* Rząd 1: Prostokąt, Polilinia, Wstęga — zarejestrowane w DRAWING_TOOLS (współdzielone z CadToolBar) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
            {DRAWING_TOOLS.filter((t) => t.mode === 'rectangle' || t.mode === 'polyline' || t.mode === 'sweep').map((tool) => (
              <button
                key={tool.mode}
                type="button"
                onClick={() => {
                  setDrawingMode(drawingMode === tool.mode ? 'none' : tool.mode);
                  setDrawingVerticesCount(0);
                  setIsDimensionToolActive(false);
                  setIsProjectBrushActive(false);
                  setFacadePointMode(false);
                  setIsEditMode(false);
                }}
                className={`btn-tile ${drawingMode === tool.mode ? 'active-indigo' : 'inactive'}`}
                style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
                title={tool.title}
              >
                <tool.Icon size={13} />
                <span style={{ fontWeight: 600 }}>{tool.label}</span>
              </button>
            ))}
          </div>

          {/* Pasek opcji Wstęgi (gdy aktywny tryb sweep) */}
          {drawingMode === 'sweep' && (
            <div
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>Szer:</span>
                <input
                  type="number"
                  min="0.5"
                  max="100"
                  step="0.5"
                  value={sweepWidth}
                  onChange={(e) => setSweepWidth(parseFloat(e.target.value) || 1)}
                  style={{
                    width: '42px',
                    height: '20px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    fontSize: '10.5px',
                    padding: '0 3px',
                    textAlign: 'center',
                  }}
                  title="Szerokość wstęgi w metrach"
                />
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>m</span>
              </div>

              <div style={{ display: 'flex', gap: '2px', backgroundColor: 'var(--bg-input)', padding: '2px', borderRadius: '5px', border: '1px solid var(--border-light)' }}>
                <button
                  type="button"
                  onClick={() => setSweepAlignment('center')}
                  style={{
                    padding: '2px 5px',
                    fontSize: '9.5px',
                    fontWeight: sweepAlignment === 'center' ? 700 : 500,
                    borderRadius: '3px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: sweepAlignment === 'center' ? '#38bdf8' : 'transparent',
                    color: sweepAlignment === 'center' ? '#0f172a' : '#94a3b8',
                  }}
                  title="Odsunięcie symetryczne z obu stron osi"
                >
                  Oś
                </button>
                <button
                  type="button"
                  onClick={() => setSweepAlignment('left')}
                  style={{
                    padding: '2px 5px',
                    fontSize: '9.5px',
                    fontWeight: sweepAlignment === 'left' ? 700 : 500,
                    borderRadius: '3px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: sweepAlignment === 'left' ? '#38bdf8' : 'transparent',
                    color: sweepAlignment === 'left' ? '#0f172a' : '#94a3b8',
                  }}
                  title="Odsunięcie po lewej stronie (kierunek normalnej)"
                >
                  Lewo
                </button>
                <button
                  type="button"
                  onClick={() => setSweepAlignment('right')}
                  style={{
                    padding: '2px 5px',
                    fontSize: '9.5px',
                    fontWeight: sweepAlignment === 'right' ? 700 : 500,
                    borderRadius: '3px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: sweepAlignment === 'right' ? '#38bdf8' : 'transparent',
                    color: sweepAlignment === 'right' ? '#0f172a' : '#94a3b8',
                  }}
                  title="Odsunięcie po prawej stronie (przeciwnie do normalnej)"
                >
                  Prawo
                </button>
              </div>
            </div>
          )}

          {/* Rząd 3: Wymiar, Pędzel, Punkt fasady */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
            <button
              type="button"
              onClick={() => {
                setIsDimensionToolActive(!isDimensionToolActive);
                setIsProjectBrushActive(false);
                setDrawingMode('none');
                setDrawingVerticesCount(0);
                setFacadePointMode(false);
                setIsEditMode(false);
              }}
              className={`btn-tile ${isDimensionToolActive ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Dodaj wymiar: kliknij 1. i 2. krawędź"
            >
              <Ruler size={13} />
              <span style={{ fontWeight: 600 }}>Wymiar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsProjectBrushActive(!isProjectBrushActive);
                setIsDimensionToolActive(false);
                setDrawingMode('none');
                setDrawingVerticesCount(0);
                setFacadePointMode(false);
                setIsEditMode(false);
              }}
              className={`btn-tile ${isProjectBrushActive ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Pędzel 'W projekcie': kliknij obiekt, aby przełączyć; przeciągnij, aby dodać"
            >
              <Paintbrush size={13} />
              <span style={{ fontWeight: 600 }}>Pędzel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFacadePointMode(!facadePointMode);
                setIsProjectBrushActive(false);
                setDrawingMode('none');
                setIsDimensionToolActive(false);
                setIsEditMode(false);
              }}
              className={`btn-tile ${facadePointMode ? 'active-indigo' : 'inactive'}`}
              style={{ justifyContent: 'center', gap: '4px', padding: '8px 4px', fontSize: '11px' }}
              title="Kliknij lub przeciągnij punkt fasady"
            >
              <MapPin size={13} />
              <span style={{ fontWeight: 600 }}>Fasada</span>
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
          {selectedBuilding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => duplicateBuilding(selectedBuilding.id)}
                  className="btn-tile active-indigo"
                  style={{ justifyContent: 'center', gap: '6px', padding: '8px 6px' }}
                  title="Utwórz kopię tego obiektu"
                >
                  <Copy size={13} />
                  <span style={{ fontWeight: 600 }}>Duplikuj</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedBuildingId}
                  onClick={() => {
                    if (!selectedBuildingId) return;
                    if (drawingMode === 'align') {
                      cancelAlign();
                      setDrawingMode('none');
                    } else {
                      cancelAlign();
                      setDrawingMode('align');
                      setDrawingVerticesCount(0);
                      setIsDimensionToolActive(false);
                      setFacadePointMode(false);
                      setIsEditMode(false);
                    }
                  }}
                  className={`btn-tile ${drawingMode === 'align' ? 'active-indigo' : 'inactive'}`}
                  style={{ justifyContent: 'center', gap: '6px', padding: '8px 6px' }}
                  title={ALIGN_TOOL.title}
                >
                  <ALIGN_TOOL.Icon size={13} />
                  <span style={{ fontWeight: 600 }}>{ALIGN_TOOL.label}</span>
                </button>

                <button
                  type="button"
                  onClick={() => deleteBuilding(selectedBuilding.id)}
                  style={{
                    padding: '8px 6px',
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
                    Klikaj etykiety <b>+</b> na scenie, aby dodać obiekty do grupy, lub <b>−</b>, aby je odłączyć.
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
                    Zakończ łączenie
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
                  <div style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Link size={13} />
                      <span>{useSceneStore.getState().openGroupId === selectedBuilding.groupId ? 'Wnętrze grupy logicznej' : 'Obiekt logiczny (Grupa)'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
                    {useSceneStore.getState().openGroupId === selectedBuilding.groupId ? (
                      <button
                        type="button"
                        onClick={() => useSceneStore.getState().setOpenGroupId(null)}
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
                        <span>Wyjdź z grupy</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => useSceneStore.getState().setOpenGroupId(selectedBuilding.groupId || null)}
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
                        <span>Wejdź do środka</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => performUnlinkBuilding(selectedBuilding.id)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(244, 63, 94, 0.4)',
                        backgroundColor: 'rgba(244, 63, 94, 0.12)',
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
                      <span>Odłącz</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 4px' }}>
              Zaznacz budynek lub obszar na scenie, aby zarządzać jego geometrią.
            </div>
          )}
        </div>
      </div>

      {/* MODYFIKATORY GEOMETRII 2.5D */}
      <div className="ui-card">
        <div className="ui-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Modyfikatory 2.5D</span>
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
          <SetbackPenthouseIcon size={14} color="#a855f7" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {selectedBuilding ? (
            <>
              {selectedBuilding.groupId || selectedBuilding.category === 'compound' ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#fbbf24',
                    fontSize: '10.5px',
                    lineHeight: '1.4',
                  }}
                >
                  Obiekt jest połączony w grupę logiczną (Node) — transformacje wykonują się wspólnie, a modyfikatory są zablokowane.
                </div>
              ) : null}
              {ADD_MODIFIER_ROWS.map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, 1fr)`, gap: '4px' }}>
                  {row.map((type) => {
                    const descriptor = MODIFIER_DESCRIPTORS[type];
                    const isGroupMember = !!selectedBuilding.groupId || selectedBuilding.category === 'compound';
                    const disabled = isGroupMember || (type !== 'zone_offset' && selectedBuilding.category === 'boundary');
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          addBuildingModifier(selectedBuilding.id, descriptor.createDefault());
                          setShowModifiersPanel(true);
                        }}
                        className="btn-tile active-indigo"
                        style={{
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '7px 4px',
                          fontSize: '10px',
                          opacity: disabled ? 0.4 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                        title={
                          isGroupMember
                            ? 'Obiekty połączone w grupę logiczną nie mogą posiadać modyfikatorów geometrycznych'
                            : disabled
                            ? 'Obiekty geodezyjne (granica/obszar) nie posiadają kondygnacji ani elewacji'
                            : `Dodaj modyfikator: ${descriptor.title}`
                        }
                      >
                        <descriptor.Icon size={12} color={disabled ? 'var(--text-secondary)' : descriptor.accentVar} />
                        <span style={{ fontWeight: 600 }}>+ {descriptor.title.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Quick list of modifiers */}
              {selectedBuilding.modifiers && selectedBuilding.modifiers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                  {selectedBuilding.modifiers.map((m, idx) => {
                    const descriptor = MODIFIER_DESCRIPTORS[m.type];

                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: m.enabled ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.6)',
                          border: `1px solid ${m.enabled ? descriptor.accentVar : 'rgba(255, 255, 255, 0.08)'}`,
                          fontSize: '10.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={() => toggleBuildingModifier(selectedBuilding.id, m.id)}
                            style={{ cursor: 'pointer', accentColor: descriptor.accentVar }}
                          />
                          <span style={{ color: m.enabled ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>
                            #{idx + 1} {descriptor.title}{' '}
                            <span style={{ opacity: 0.85 }}>{descriptor.formatSummary(m)}</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBuildingModifier(selectedBuilding.id, m.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-rose)',
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
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', textAlign: 'center', padding: '4px 0' }}>
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

      {/* 3.3 Kafel Modyfikatory obszarów */}
      <div className="ui-card">
        <div className="ui-title">
          <span>Modyfikatory obszarów</span>
          <Layers size={14} color="#a855f7" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {selectedBuilding ? (
            AREA_MODIFIER_ROWS.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, 1fr)`, gap: '4px' }}>
                {row.map((type) => {
                  const descriptor = MODIFIER_DESCRIPTORS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        addBuildingModifier(selectedBuilding.id, descriptor.createDefault());
                        setShowModifiersPanel(true);
                      }}
                      className="btn-tile active-indigo"
                      style={{ justifyContent: 'center', gap: '4px', padding: '7px 4px', fontSize: '10px' }}
                      title={`Dodaj modyfikator: ${descriptor.title}`}
                    >
                      <descriptor.Icon size={12} color={descriptor.accentVar} />
                      <span style={{ fontWeight: 600 }}>+ {descriptor.title.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div style={{ fontSize: '10.5px', color: '#94a3b8', textAlign: 'center', padding: '6px 0' }}>
              Zaznacz budynek lub obszar, aby zarządzać modyfikatorami obszaru.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
