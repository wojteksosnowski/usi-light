import { useEffect } from 'react';
import { Point2D } from '../../../types/geometry';

export function useCadHotkeys({
  drawingMode,
  drawingVertices,
  hoveredBuildings,
  onCancelDrawing,
  onFinishDrawing,
  setDrawingVertices,
  setCurrentMouseWorld,
  setHoveredBuildingIndex,
}: {
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit';
  drawingVertices: Point2D[];
  hoveredBuildings: string[];
  onCancelDrawing?: () => void;
  onFinishDrawing?: (vertices: Point2D[], shapeType: 'rectangle' | 'polyline') => void;
  setDrawingVertices: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setCurrentMouseWorld: React.Dispatch<React.SetStateAction<Point2D | null>>;
  setHoveredBuildingIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      } else if (e.key === 'Tab' && hoveredBuildings.length > 1) {
        e.preventDefault();
        setHoveredBuildingIndex((prev) => (prev + 1) % hoveredBuildings.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    drawingMode,
    drawingVertices,
    hoveredBuildings,
    onCancelDrawing,
    onFinishDrawing,
    setDrawingVertices,
    setCurrentMouseWorld,
    setHoveredBuildingIndex,
  ]);
}
