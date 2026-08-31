import { useEffect } from 'react';
import { Point2D } from '../../../types/geometry';

export function useCadHotkeys({
  drawingMode,
  drawingVertices,
  hoveredBuildings,
  selectedVertexIndex,
  onDeleteSelectedVertex,
  onCancelDrawing,
  onFinishDrawing,
  setDrawingVertices,
  setCurrentMouseWorld,
  setHoveredBuildingIndex,
  isEditingEdgeLength = false,
  onAdjustEdgeLengthStep,
  onEdgeLengthInputChar,
  onEdgeLengthBackspace,
  onCommitEdgeLength,
  onCancelEdgeLength,
}: {
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate';
  drawingVertices: Point2D[];
  hoveredBuildings: string[];
  selectedVertexIndex?: number | null;
  onDeleteSelectedVertex?: () => void;
  onCancelDrawing?: () => void;
  onFinishDrawing?: (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => void;
  setDrawingVertices: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setCurrentMouseWorld: React.Dispatch<React.SetStateAction<Point2D | null>>;
  setHoveredBuildingIndex: React.Dispatch<React.SetStateAction<number>>;
  isEditingEdgeLength?: boolean;
  onAdjustEdgeLengthStep?: (delta: number) => void;
  onEdgeLengthInputChar?: (char: string) => void;
  onEdgeLengthBackspace?: () => void;
  onCommitEdgeLength?: () => void;
  onCancelEdgeLength?: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If actively typing into an HTML input, don't intercept
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (isEditingEdgeLength) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelEdgeLength?.();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommitEdgeLength?.();
          return;
        }
        if (e.key === '[' || e.key === '{') {
          e.preventDefault();
          onAdjustEdgeLengthStep?.(e.shiftKey ? -0.1 : -0.5);
          return;
        }
        if (e.key === ']' || e.key === '}') {
          e.preventDefault();
          onAdjustEdgeLengthStep?.(e.shiftKey ? 0.1 : 0.5);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          onEdgeLengthBackspace?.();
          return;
        }
        if (/^[0-9.,]$/.test(e.key)) {
          e.preventDefault();
          onEdgeLengthInputChar?.(e.key === ',' ? '.' : e.key);
          return;
        }
      }

      if (e.key === 'Escape') {
        if (drawingMode !== 'none' || drawingVertices.length > 0) {
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
          onCancelDrawing?.();
        }
      } else if (e.key === 'Enter') {
        if (drawingMode === 'polyline' && drawingVertices.length >= 3) {
          onFinishDrawing?.(drawingVertices, 'polyline');
          setDrawingVertices([]);
          setCurrentMouseWorld(null);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && drawingMode === 'vertexEdit') {
        if (selectedVertexIndex !== null && selectedVertexIndex !== undefined) {
          e.preventDefault();
          onDeleteSelectedVertex?.();
        }
      } else if (e.key === 'Tab' && hoveredBuildings.length > 1) {
        e.preventDefault();
        setHoveredBuildingIndex((prev) => (prev + 1) % hoveredBuildings.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    drawingMode,
    selectedVertexIndex,
    onDeleteSelectedVertex,
    drawingVertices,
    hoveredBuildings,
    onCancelDrawing,
    onFinishDrawing,
    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,
    isEditingEdgeLength,
    onAdjustEdgeLengthStep,
    onEdgeLengthInputChar,
    onEdgeLengthBackspace,
    onCommitEdgeLength,
    onCancelEdgeLength,
  ]);
}
