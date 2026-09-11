import React from 'react';
import { useStore } from 'zustand';
import { Ruler, Copy, Trash2, Undo2, Redo2 } from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';
import type { DrawingMode } from '../../store/useCadToolStore';
import { DRAWING_TOOLS } from '../toolbar/drawingToolDescriptors';
import { MODIFIER_DESCRIPTORS } from '../modifiers/modifierDescriptors';
import { ModifierType } from '../../types/modifiers';

/** Modyfikatory dostępne z górnego toolbara, w kolejności prezentacji. */
const TOOLBAR_MODIFIER_TYPES: ModifierType[] = [
  'story_offset',
  'terrace',
  'donut',
  'zone_offset',
  'bay_window',
  'corner_cut',
];

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

  const showModifiersPanel = useCadToolStore((s) => s.showModifiersPanel);
  const setShowModifiersPanel = useCadToolStore((s) => s.setShowModifiersPanel);

  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const cancelAlign = useCadToolStore((s) => s.cancelAlign);

  const sweepWidth = useCadToolStore((s) => s.sweepWidth);
  const setSweepWidth = useCadToolStore((s) => s.setSweepWidth);
  const sweepAlignment = useCadToolStore((s) => s.sweepAlignment);
  const setSweepAlignment = useCadToolStore((s) => s.setSweepAlignment);

  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);

  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const setDimensionPendingRef = useCadToolStore((s) => s.setDimensionPendingRef);

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const hasModifiers = !!(selectedBuilding && selectedBuilding.modifiers && selectedBuilding.modifiers.length > 0);

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

  const buttonStyle = (isActive: boolean, activeColor = '#818cf8', activeBg = 'rgba(99, 102, 241, 0.25)'): React.CSSProperties => ({
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
    color: isActive ? activeColor : '#94a3b8',
    transition: 'all 0.15s ease',
  });

  return (
    <div className="cad-toolbar" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {/* Narzędzia rysowania — zarejestrowane w DRAWING_TOOLS (jedno źródło prawdy z sidebarem) */}
      {DRAWING_TOOLS.map((tool) => {
        const disabled = tool.requiresSelection && !selectedBuildingId;
        return (
          <button
            key={tool.mode}
            type="button"
            disabled={disabled}
            style={{
              ...buttonStyle(drawingMode === tool.mode, '#818cf8', 'rgba(99, 102, 241, 0.25)'),
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={() => activateMode(tool.mode)}
            title={disabled ? 'Zaznacz obiekt, aby wyrównać jego krawędź' : tool.title}
          >
            <tool.Icon size={14} />
          </button>
        );
      })}

      {/* Pasek opcji Wstęgi (gdy aktywny tryb sweep) */}
      {drawingMode === 'sweep' && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '11px',
            marginRight: '2px',
          }}
        >
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

          <div style={{ width: '1px', height: '12px', backgroundColor: '#334155', margin: '0 2px' }} />

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
                  border: isSelected ? '1px solid #38bdf8' : '1px solid transparent',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.3)' : 'transparent',
                  color: isSelected ? '#38bdf8' : '#94a3b8',
                }}
                title={`Odsunięcie: ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* 7. Wymiarowanie */}
      <button
        type="button"
        style={buttonStyle(isDimensionToolActive, '#818cf8', 'rgba(99, 102, 241, 0.25)')}
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

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* 9. Modyfikatory — zarejestrowane w MODIFIER_DESCRIPTORS (jedno źródło prawdy z sidebarem) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        {TOOLBAR_MODIFIER_TYPES.map((type) => {
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
              <descriptor.Icon size={14} color={eligible ? descriptor.accentVar : '#94a3b8'} />
            </button>
          );
        })}
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* 10. Duplikuj zaznaczony obiekt */}
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

      {/* 10. Usuń zaznaczony obiekt */}
      <button
        type="button"
        disabled={!hasSelection}
        style={{
          ...buttonStyle(false),
          color: hasSelection ? '#f87171' : '#64748b',
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

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* 11. Cofnij (Undo) */}
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

      {/* 12. Ponów (Redo) */}
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
  );
};
