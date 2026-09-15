import React from 'react';
import { useStore } from 'zustand';
import { Ruler, Copy, Trash2, Undo2, Redo2, Link2 } from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';
import type { DrawingMode } from '../../store/useCadToolStore';
import { DRAWING_CREATION_TOOLS, ALIGN_DRAWING_TOOL } from '../toolbar/drawingToolDescriptors';
import {
  MODIFIER_DESCRIPTORS,
  TOOLBAR_BUILDING_MODIFIER_TYPES,
  TOOLBAR_BUFFER_MODIFIER_TYPES,
} from '../modifiers/modifierDescriptors';
import { ModifierType } from '../../types/modifiers';

export const CadToolBar: React.FC = () => {
  const { undo, redo, pastStates, futureStates } = useStore(useSceneStore.temporal, (state) => state);
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const duplicateBuilding = useSceneStore((s) => s.duplicateBuilding);
  const deleteBuildings = useSceneStore((s) => s.deleteBuildings);
  const addBuildingModifier = useSceneStore((s) => s.addBuildingModifier);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const setIsLinkingMode = useSceneStore((s) => s.setIsLinkingMode);
  const setLinkingSourceId = useSceneStore((s) => s.setLinkingSourceId);

  const setShowModifiersPanel = useCadToolStore((s) => s.setShowModifiersPanel);

  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const cancelAlign = useCadToolStore((s) => s.cancelAlign);

  const sweepWidth = useCadToolStore((s) => s.sweepWidth);
  const setSweepWidth = useCadToolStore((s) => s.setSweepWidth);
  const sweepAlignment = useCadToolStore((s) => s.sweepAlignment);
  const setSweepAlignment = useCadToolStore((s) => s.setSweepAlignment);

  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);

  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const setDimensionPendingRef = useCadToolStore((s) => s.setDimensionPendingRef);

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  const hasSelection = selectedBuildingIds.length > 0 || selectedBuildingId !== null;
  const targetDeleteIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : (selectedBuildingId ? [selectedBuildingId] : []);

  const activateMode = (mode: DrawingMode) => {
    if (mode === 'align') {
      if (!selectedBuildingId) return;
      cancelAlign();
      setDrawingMode(drawingMode === 'align' ? 'none' : 'align');
    } else {
      setDrawingMode(drawingMode === mode ? 'none' : mode);
    }
    setDrawingVerticesCount(0);
    setIsDimensionToolActive(false);
    setFacadePointMode(false);
    setIsEditMode(false);
  };

  const buttonStyle = (
    isActive: boolean,
    activeColor = 'var(--accent-indigo, #818cf8)',
    activeBg = 'rgba(99, 102, 241, 0.25)'
  ): React.CSSProperties => ({
    height: '28px',
    width: '28px',
    padding: 0,
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    border: isActive ? `1px solid ${activeColor}` : '1px solid transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isActive ? activeBg : 'transparent',
    color: isActive ? activeColor : 'var(--text-muted, #94a3b8)',
    transition: 'all 0.15s ease',
  });

  const renderModifierButton = (type: ModifierType) => {
    const descriptor = MODIFIER_DESCRIPTORS[type];
    const disabled = type !== 'zone_offset' && (!selectedBuilding || selectedBuilding.category === 'boundary');
    const eligible = !disabled && !!selectedBuilding;
    return (
      <button
        key={type}
        type="button"
        disabled={!eligible}
        style={{
          ...buttonStyle(false),
          opacity: eligible ? 1 : 0.35,
          cursor: eligible ? 'pointer' : 'not-allowed',
        }}
        onClick={() => {
          if (!eligible || !selectedBuilding) return;
          addBuildingModifier(selectedBuilding.id, descriptor.createDefault());
          setShowModifiersPanel(true);
        }}
        title={
          !selectedBuilding
            ? `${descriptor.title} (zaznacz obiekt na scenie, aby dodać modyfikator)`
            : disabled
            ? 'Obiekty geodezyjne (granica/obszar) nie obsługują modyfikatorów wysokościowych'
            : `Dodaj / edytuj: ${descriptor.title}`
        }
      >
        <descriptor.Icon size={14} color={eligible ? descriptor.accentVar : 'var(--text-muted, #94a3b8)'} />
      </button>
    );
  };

  const renderSeparator = () => (
    <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle, #334155)' }} />
  );

  return (
    <div className="cad-toolbar" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {/* Grupa 1: Narzędzia rysowania (Prostokąt, Polilinia, Wstęga) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {DRAWING_CREATION_TOOLS.map((tool) => (
          <button
            key={tool.mode}
            type="button"
            style={buttonStyle(drawingMode === tool.mode, 'var(--accent-indigo, #818cf8)', 'rgba(99, 102, 241, 0.25)')}
            onClick={() => activateMode(tool.mode)}
            title={tool.title}
          >
            <tool.Icon size={14} />
          </button>
        ))}
      </div>

      {/* Pasek opcji Wstęgi (gdy aktywny tryb sweep) */}
      {drawingMode === 'sweep' && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--accent-cyan, #38bdf8)',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '11px',
            marginRight: '2px',
          }}
        >
          <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '10px' }}>Szer:</span>
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
              backgroundColor: 'var(--bg-input, #1e293b)',
              border: '1px solid var(--border-light, #475569)',
              borderRadius: '4px',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '10.5px',
              padding: '0 3px',
              textAlign: 'center',
            }}
            title="Szerokość wstęgi w metrach"
          />
          <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '10px' }}>m</span>

          <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle, #334155)', margin: '0 2px' }} />

          {(['center', 'left', 'right'] as const).map((mode) => {
            const label = mode === 'center' ? 'Oś' : mode === 'left' ? 'Lewo' : 'Prawo';
            const isSelected = sweepAlignment === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSweepAlignment(mode)}
                style={{
                  height: '20px',
                  padding: '0 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--accent-cyan, #38bdf8)' : '1px solid transparent',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.3)' : 'transparent',
                  color: isSelected ? 'var(--accent-cyan, #38bdf8)' : 'var(--text-muted, #94a3b8)',
                }}
                title={`Odsunięcie: ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {renderSeparator()}

      {/* Grupa 2: Modyfikatory bryły (Uskok, Taras, Donat, Wykusz, Ścięcie) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {TOOLBAR_BUILDING_MODIFIER_TYPES.map(renderModifierButton)}
      </div>

      {renderSeparator()}

      {/* Grupa 3: Bufor i Strefy (Bufor, Strefa funkcji) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {TOOLBAR_BUFFER_MODIFIER_TYPES.map(renderModifierButton)}
      </div>

      {renderSeparator()}

      {/* Grupa 4: Miarka / Wymiarowanie */}
      <button
        type="button"
        style={buttonStyle(isDimensionToolActive, 'var(--accent-indigo, #818cf8)', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setIsDimensionToolActive(!isDimensionToolActive);
          setDimensionPendingRef(null);
          setDrawingMode('none');
          setDrawingVerticesCount(0);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Dodaj wymiar liniowy / kątowy"
      >
        <Ruler size={14} />
      </button>

      {renderSeparator()}

      {/* Grupa 5: Operacje na obiektach (Wyrównaj, Połącz, Duplikuj, Kasuj) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {/* Wyrównaj */}
        <button
          type="button"
          disabled={!selectedBuildingId}
          style={{
            ...buttonStyle(drawingMode === ALIGN_DRAWING_TOOL.mode, 'var(--accent-indigo, #818cf8)', 'rgba(99, 102, 241, 0.25)'),
            opacity: selectedBuildingId ? 1 : 0.4,
            cursor: selectedBuildingId ? 'pointer' : 'not-allowed',
          }}
          onClick={() => activateMode(ALIGN_DRAWING_TOOL.mode)}
          title={!selectedBuildingId ? 'Zaznacz obiekt, aby wyrównać jego krawędź' : ALIGN_DRAWING_TOOL.title}
        >
          <ALIGN_DRAWING_TOOL.Icon size={14} />
        </button>

        {/* Połącz (Linking mode) */}
        <button
          type="button"
          disabled={!selectedBuildingId && !isLinkingMode}
          style={{
            ...buttonStyle(isLinkingMode, 'var(--accent-amber, #f59e0b)', 'rgba(245, 158, 11, 0.25)'),
            opacity: selectedBuildingId || isLinkingMode ? 1 : 0.4,
            cursor: selectedBuildingId || isLinkingMode ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (isLinkingMode) {
              setIsLinkingMode(false);
              setLinkingSourceId(null);
            } else if (selectedBuildingId) {
              setIsLinkingMode(true);
              setLinkingSourceId(selectedBuildingId);
              setDrawingMode('none');
              setDrawingVerticesCount(0);
              setIsDimensionToolActive(false);
              setFacadePointMode(false);
              setIsEditMode(false);
            }
          }}
          title={
            isLinkingMode
              ? 'Tryb łączenia aktywny — kliknij drugi obiekt na scenie, aby go połączyć (lub kliknij ponownie, aby anulować)'
              : selectedBuildingId
              ? `Połącz ${selectedBuilding ? selectedBuilding.name : 'zaznaczony obiekt'} z innym obiektem`
              : 'Zaznacz obiekt, aby go połączyć'
          }
        >
          <Link2 size={14} />
        </button>

        {/* Duplikuj zaznaczony obiekt */}
        <button
          type="button"
          disabled={!selectedBuildingId}
          style={{
            ...buttonStyle(false),
            opacity: selectedBuildingId ? 1 : 0.4,
            cursor: selectedBuildingId ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (selectedBuildingId) duplicateBuilding(selectedBuildingId);
          }}
          title={selectedBuildingId ? 'Duplikuj zaznaczony obiekt' : 'Zaznacz obiekt, aby go zduplikować'}
        >
          <Copy size={14} />
        </button>

        {/* Usuń zaznaczony obiekt */}
        <button
          type="button"
          disabled={!hasSelection}
          style={{
            ...buttonStyle(false),
            color: hasSelection ? 'var(--accent-danger, #f87171)' : 'var(--text-dim, #64748b)',
            opacity: hasSelection ? 1 : 0.4,
            cursor: hasSelection ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (targetDeleteIds.length > 0) deleteBuildings(targetDeleteIds);
          }}
          title={hasSelection ? 'Usuń zaznaczone obiekty [Del / Backspace]' : 'Zaznacz obiekt, aby go usunąć'}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {renderSeparator()}

      {/* Grupa 6: Historia zmian (Cofnij, Ponów) */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <button
          type="button"
          disabled={!canUndo}
          style={{
            ...buttonStyle(false),
            opacity: canUndo ? 1 : 0.35,
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
          onClick={() => undo()}
          title={canUndo ? 'Cofnij [Ctrl+Z / Cmd+Z]' : 'Brak wcześniejszych zmian do cofnięcia'}
        >
          <Undo2 size={14} />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          style={{
            ...buttonStyle(false),
            opacity: canRedo ? 1 : 0.35,
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
          onClick={() => redo()}
          title={canRedo ? 'Ponów [Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y]' : 'Brak zmian do ponowienia'}
        >
          <Redo2 size={14} />
        </button>
      </div>
    </div>
  );
};

