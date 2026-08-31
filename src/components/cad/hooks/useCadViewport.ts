import { useState, useCallback, useEffect } from 'react';
import { ViewportState } from '../types';
import { BuildingLoop } from '../../../types/geometry';

export function useCadViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  buildings: BuildingLoop[],
  viewRotationDeg: number,
  fitTrigger?: number
) {
  const [viewState, setViewState] = useState<ViewportState>({
    panX: 500,
    panY: 450,
    scale: 14,
  });

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const rot = (viewRotationDeg * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const rx = wx * cos - wy * sin;
      const ry = wx * sin + wy * cos;
      return {
        sx: viewState.panX + rx * viewState.scale,
        sy: viewState.panY - ry * viewState.scale,
      };
    },
    [viewState, viewRotationDeg]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rot = (viewRotationDeg * Math.PI) / 180;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const rx = (sx - viewState.panX) / viewState.scale;
      const ry = -(sy - viewState.panY) / viewState.scale;
      return {
        wx: rx * cos - ry * sin,
        wy: rx * sin + ry * cos,
      };
    },
    [viewState, viewRotationDeg]
  );

  const fitToExtents = useCallback(() => {
    const container = containerRef.current;
    if (!container || buildings.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width > 50 ? rect.width : window.innerWidth - 380;
    const height = rect.height > 50 ? rect.height : window.innerHeight;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const bldg of buildings) {
      for (const v of bldg.vertices) {
        if (Number.isFinite(v.x) && v.x < minX) minX = v.x;
        if (Number.isFinite(v.x) && v.x > maxX) maxX = v.x;
        if (Number.isFinite(v.y) && v.y < minY) minY = v.y;
        if (Number.isFinite(v.y) && v.y > maxY) maxY = v.y;
      }
    }

    if (minX === Infinity) return;

    const bboxWidth = Math.max(5, maxX - minX);
    const bboxHeight = Math.max(5, maxY - minY);
    const rot = (viewRotationDeg * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rotated = buildings.flatMap((bldg) =>
      bldg.vertices.map((v) => ({
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
      }))
    );
    let rMinX = Infinity;
    let rMaxX = -Infinity;
    let rMinY = Infinity;
    let rMaxY = -Infinity;
    for (const p of rotated) {
      if (p.x < rMinX) rMinX = p.x;
      if (p.x > rMaxX) rMaxX = p.x;
      if (p.y < rMinY) rMinY = p.y;
      if (p.y > rMaxY) rMaxY = p.y;
    }
    const rotatedCenterX = (rMinX + rMaxX) / 2;
    const rotatedCenterY = (rMinY + rMaxY) / 2;

    const scaleX = (width * 0.80) / bboxWidth;
    const scaleY = (height * 0.80) / bboxHeight;
    const newScale = Math.max(0.001, Math.min(100, Math.min(scaleX, scaleY)));

    const panX = width / 2 - rotatedCenterX * newScale;
    const panY = height / 2 + rotatedCenterY * newScale;

    setViewState({
      panX,
      panY,
      scale: newScale,
    });
  }, [buildings, viewRotationDeg, containerRef]);

  useEffect(() => {
    fitToExtents();
    const t = setTimeout(fitToExtents, 100);
    return () => clearTimeout(t);
  }, [fitTrigger]);

  return {
    viewState,
    setViewState,
    worldToScreen,
    screenToWorld,
    fitToExtents,
  };
}
