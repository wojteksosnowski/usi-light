import React from 'react';
import {
  Square,
  PenTool,
  RotateCw,
  Edit3,
  Maximize2,
  Combine,
  Ruler,
  MapPin,
  Copy,
  Trash2,
} from 'lucide-react';
import { useSceneStore, useCadToolStore } from '../../store';

export const CadToolBar: React.FC = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const duplicateBuilding = useSceneStore((s) => s.duplicateBuilding);
  const deleteBuildings = useSceneStore((s) => s.deleteBuildings);

  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const setRotateInitialBuildingsSnapshot = useCadToolStore((s) => s.setRotateInitialBuildingsSnapshot);

  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);

  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const setDimensionPendingRef = useCadToolStore((s) => s.setDimensionPendingRef);

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
    <div className="cad-toolbar">
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
        <PenTool size={14} />
      </button>

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

      {/* 4. Wierzchołki */}
      <button
        type="button"
        style={buttonStyle(drawingMode === 'vertexEdit', '#818cf8', 'rgba(99, 102, 241, 0.25)')}
        onClick={() => {
          setDrawingMode(drawingMode === 'vertexEdit' ? 'none' : 'vertexEdit');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
          setIsEditMode(false);
        }}
        title="Edycja wierzchołków bryły (Esc aby zakończyć)"
      >
        <Edit3 size={14} />
      </button>

      {/* 5. Krawędzie (Offset) */}
      <button
        type="button"
        style={buttonStyle(isEditMode, '#f59e0b', 'rgba(245, 158, 11, 0.2)')}
        onClick={() => {
          setIsEditMode(!isEditMode);
          setDrawingMode('none');
          setDrawingVerticesCount(0);
          setIsDimensionToolActive(false);
          setFacadePointMode(false);
        }}
        title="Równoległe przesuwanie krawędzi (Offset)"
      >
        <Maximize2 size={14} />
      </button>

      {/* 6. Suma boolowska */}
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

      {/* 9. Duplikuj zaznaczony obiekt */}
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
