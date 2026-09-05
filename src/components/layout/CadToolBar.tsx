import React from 'react';
import {
  Square,
  RotateCw,
  Combine,
  Ruler,
  MapPin,
  Copy,
  Trash2,
} from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { TrapezoidIcon, BrokenLineIcon, ZoneBufferIcon, BayWindowIcon } from '../common/CustomCadIcons';

export const CadToolBar: React.FC = () => {
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
  const setRotateInitialBuildingsSnapshot = useCadToolStore((s) => s.setRotateInitialBuildingsSnapshot);

  const sweepWidth = useCadToolStore((s) => s.sweepWidth);
  const setSweepWidth = useCadToolStore((s) => s.setSweepWidth);
  const sweepAlignment = useCadToolStore((s) => s.sweepAlignment);
  const setSweepAlignment = useCadToolStore((s) => s.setSweepAlignment);

  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);

  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const setDimensionPendingRef = useCadToolStore((s) => s.setDimensionPendingRef);

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const hasModifiers = !!(selectedBuilding && selectedBuilding.modifiers && selectedBuilding.modifiers.length > 0);

  const hasSelection = selectedBuildingIds.length > 0 || selectedBuildingId !== null;
  const targetDeleteIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : (selectedBuildingId ? [selectedBuildingId] : []);

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
      {/* 1. Prostokąt */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'rectangle', '#818cf8', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setDrawingMode(drawingMode === 'rectangle' ? 'none' : 'rectangle');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Rysuj prostokąt (Esc aby anulować)"
      >
        <Square size={14} />
      </button>

      {/* 2. Polilinia */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'polyline', '#818cf8', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setDrawingMode(drawingMode === 'polyline' ? 'none' : 'polyline');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Rysuj polilinię (Esc aby anulować, Enter by zamknąć)"
      >
        <TrapezoidIcon size={14} />
      </button>

      {/* 2b. Wstęga (Sweep) */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'sweep', '#38bdf8', 'rgba(56, 189, 248, 0.25)')}
        onClick={() => {
          setDrawingMode(drawingMode === 'sweep' ? 'none' : 'sweep');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Rysuj wstęgę z odsunięciem / sweep (Esc aby anulować, Enter by zakończyć)"
      >
        <BrokenLineIcon size={14} />
      </button>

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

      {/* 3. Obrót */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'rotate', '#818cf8', 'rgba(99, 102, 241, 0.25)')}
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
        title="Obrót zaznaczonych obiektów wokół punktu (Esc aby anulować)"
      >
        <RotateCw size={14} />
      </button>

      {/* 4. Suma boolowska */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'union', '#818cf8', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setDrawingMode(drawingMode === 'union' ? 'none' : 'union');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Suma boolowska brył (Union)"
      >
        <Combine size={14} />
      </button>

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

      {/* 8. Punkt fasady */}
      <button
        type="button"
        style={buttonStyle(facadePointMode, '#818cf8', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setFacadePointMode(!facadePointMode);
          setDrawingMode('none');
          setIsDimensionToolActive(false);
          setIsEditMode(false);
        }}
        title="Dodaj punkt kontrolny analizy na fasadzie"
      >
        <MapPin size={14} />
      </button>

      <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

      {/* 9. Modyfikatory (Uskok 2.5D, Strefa oraz Wykusz) */}
      {(() => {
        const isStoryEligible = !!selectedBuilding && selectedBuilding.category !== 'boundary';
        const isEligible = !!selectedBuilding;

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {/* Przycisk Uskok 2.5D */}
            <button
              type="button"
              disabled={!isStoryEligible}
              style={{
                ...buttonStyle(false),
                opacity: isStoryEligible ? 1 : 0.35,
                cursor: isStoryEligible ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (!isStoryEligible) return;
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
              title={
                !selectedBuilding
                  ? 'Modyfikator Uskok 2.5D (zaznacz budynek na scenie, aby dodać uskok)'
                  : selectedBuilding.category === 'boundary'
                  ? 'Obiekty geodezyjne (granica/obszar) nie obsługują modyfikatorów wysokościowych'
                  : 'Dodaj / edytuj uskok 2.5D (penthouse / podcień)'
              }
            >
              <SetbackPenthouseIcon size={14} color={isStoryEligible ? '#c084fc' : '#94a3b8'} />
            </button>

            {/* Przycisk Strefa / Obszar */}
            <button
              type="button"
              disabled={!isEligible}
              style={{
                ...buttonStyle(false),
                opacity: isEligible ? 1 : 0.35,
                cursor: isEligible ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (!isEligible) return;
                const newMod = {
                  id: `mod-zone-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  type: 'zone_offset' as const,
                  enabled: true,
                  distance: 4.0,
                  areaType: 'plot' as const,
                  name: 'Strefa buforowa',
                };
                addBuildingModifier(selectedBuilding.id, newMod);
                setShowModifiersPanel(true);
              }}
              title={
                !selectedBuilding
                  ? 'Modyfikator Strefa (zaznacz obiekt na scenie, aby dodać strefę/bufor)'
                  : 'Dodaj / edytuj strefę (obszar buforowy o zadanym offsecie)'
              }
            >
              <ZoneBufferIcon size={14} color={isEligible ? '#38bdf8' : '#94a3b8'} />
            </button>

            {/* Przycisk Wykusz (Bay Window) */}
            <button
              type="button"
              disabled={!isEligible}
              style={{
                ...buttonStyle(false),
                opacity: isEligible ? 1 : 0.35,
                cursor: isEligible ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (!isEligible) return;
                const newMod = {
                  id: `mod-bay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  type: 'bay_window' as const,
                  enabled: true,
                  width: 4.0,
                  projection: 1.5,
                  storiesCount: 0,
                };
                addBuildingModifier(selectedBuilding.id, newMod);
                setShowModifiersPanel(true);
              }}
              title={
                !selectedBuilding
                  ? 'Modyfikator Wykusz (zaznacz obiekt na scenie, aby dodać wykusz)'
                  : 'Dodaj / edytuj wykusz (Bay Window) na elewacji / obwodzie'
              }
            >
              <BayWindowIcon size={14} color={isEligible ? '#fef08a' : '#94a3b8'} />
            </button>
          </div>
        );
      })()}

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
    </div>
  );
};
