import { useEffect } from 'react';
import { Point2D } from '../../../types/geometry';

export function useCadHotkeys({
  drawingMode,
  drawingVertices,
  hoveredBuildings,
  selectedVertexIndex,
  onDeleteSelectedVertex,
  onCycleVertexSelection,
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
  onToggleOsnap,
  onStepRotateBuilding,
}: {
  drawingMode: 'none' | 'rectangle' | 'polyline' | 'vertexEdit' | 'rotate' | 'union';
  drawingVertices: Point2D[];
  hoveredBuildings: string[];
  selectedVertexIndex?: number | null;
  onDeleteSelectedVertex?: () => void;
  onCycleVertexSelection?: (direction: 'prev' | 'next') => void;
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
  onToggleOsnap?: () => void;
  onStepRotateBuilding?: (direction: 'cw' | 'ccw') => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing inside an HTML input/textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (isEditingEdgeLength) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancelEdgeLength?.();
          return;
        }
        if (e.key === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          onCommitEdgeLength?.();
          return;
        }
        // Decrease step: '[' or '-'
        if (
          e.key === '[' ||
          e.key === '{' ||
          e.code === 'BracketLeft' ||
          e.key === '-' ||
          e.code === 'Minus' ||
          e.code === 'NumpadSubtract'
        ) {
          e.preventDefault();
          onAdjustEdgeLengthStep?.(e.shiftKey ? -0.5 : -0.1);
          return;
        }
        // Increase step: ']' or '+' / '='
        if (
          e.key === ']' ||
          e.key === '}' ||
          e.code === 'BracketRight' ||
          e.key === '+' ||
          e.key === '=' ||
          e.code === 'Equal' ||
          e.code === 'NumpadAdd'
        ) {
          e.preventDefault();
          onAdjustEdgeLengthStep?.(e.shiftKey ? 0.5 : 0.1);
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          onEdgeLengthBackspace?.();
          return;
        }
        // Numeric input (digits and decimal separator)
        if (/^[0-9.,]$/.test(e.key)) {
          e.preventDefault();
          onEdgeLengthInputChar?.(e.key === ',' ? '.' : e.key);
          return;
        }
        if (e.code.startsWith('Numpad') && /^[0-9]$/.test(e.code.replace('Numpad', ''))) {
          e.preventDefault();
          onEdgeLengthInputChar?.(e.code.replace('Numpad', ''));
          return;
        }
        if (e.code === 'NumpadDecimal' || e.code === 'Period' || e.code === 'Comma') {
          e.preventDefault();
          onEdgeLengthInputChar?.('.');
          return;
        }
      }

      if (e.key === 'F3') {
        e.preventDefault();
        onToggleOsnap?.();
        return;
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
        } else if (drawingMode === 'rotate') {
          onFinishDrawing?.([], 'rectangle');
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && drawingMode === 'vertexEdit') {
        if (selectedVertexIndex !== null && selectedVertexIndex !== undefined) {
          e.preventDefault();
          onDeleteSelectedVertex?.();
        }
      } else if (drawingMode === 'vertexEdit' && !isEditingEdgeLength) {
        if (e.key === '[' || e.key === '{' || e.code === 'BracketLeft') {
          e.preventDefault();
          onCycleVertexSelection?.('prev');
        } else if (e.key === ']' || e.key === '}' || e.code === 'BracketRight') {
          e.preventDefault();
          onCycleVertexSelection?.('next');
        }
      } else if (drawingMode === 'rotate') {
        if (e.key === '[' || e.key === '{' || e.code === 'BracketLeft') {
          e.preventDefault();
          onStepRotateBuilding?.('ccw');
        } else if (e.key === ']' || e.key === '}' || e.code === 'BracketRight') {
          e.preventDefault();
          onStepRotateBuilding?.('cw');
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
    onCycleVertexSelection,
    onStepRotateBuilding,
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
    onToggleOsnap,
  ]);
}
