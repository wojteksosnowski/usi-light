import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ViewportState } from '../types';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { useUiStore } from '../../../store/useUiStore';
import { createViewportMatrix, invertAffineMatrix, transformPoint, AffineMatrix2D } from '@/utils/math2d';

export interface FitToExtentsOptions {
  ignoreSelection?: boolean;
  fitMode?: 'contain' | 'cover' | 'project_circle_cover';
  preferTested?: boolean;
  scaleFactor?: number;
}

export function useCadViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  buildings: BuildingLoop[],
  viewRotationDeg: number,
  fitRequest?: {
    nonce: number;
    ignoreSelection: boolean;
    fitMode?: 'contain' | 'cover' | 'project_circle_cover';
    preferTested?: boolean;
    scaleFactor?: number;
  },
  selectedBuildingId?: string | null,
  layerSettings?: Record<string, any>,
  projectRadius?: number
) {
  const [viewState, setViewState] = useState<ViewportState>({
    panX: 500,
    panY: 450,
    scale: 14,
  });

  const prevRotationRef = useRef<number>(viewRotationDeg);

  // Koalescencja wysokoczęstotliwościowych aktualizacji (wheel/mousemove przy pan/zoom) do rAF —
  // bez tego każde zdarzenie DOM synchronicznie odpala setState() na CadCanvas, co przy gęstszych
  // niż budżet klatki zdarzeniach powoduje kaskadowe re-rendery blokujące React Scheduler
  // (zmierzone w DevTools Performance: "Update Blocked"/"Cascading Update" na CadCanvas).
  // `setViewState` zostaje bez zmian dla rzadkich, jednorazowych aktualizacji (fitToExtents, obrót).
  const pendingViewStateUpdateRef = useRef<((prev: ViewportState) => ViewportState) | null>(null);
  const viewStateRafIdRef = useRef<number | null>(null);

  const scheduleViewState = useCallback((updater: (prev: ViewportState) => ViewportState) => {
    pendingViewStateUpdateRef.current = updater;
    if (viewStateRafIdRef.current === null) {
      viewStateRafIdRef.current = requestAnimationFrame(() => {
        viewStateRafIdRef.current = null;
        const pending = pendingViewStateUpdateRef.current;
        pendingViewStateUpdateRef.current = null;
        if (pending) setViewState(pending);
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (viewStateRafIdRef.current !== null) {
        cancelAnimationFrame(viewStateRafIdRef.current);
        viewStateRafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    useUiStore.getState().setViewportScale(viewState.scale);
  }, [viewState.scale]);

  // Zabezpieczenie środka ekranu przy obrocie widoku (obrót wokół centrum ekranu, a nie wokół (0,0))
  useEffect(() => {
    const prevRot = prevRotationRef.current;
    if (Math.abs(prevRot - viewRotationDeg) > 1e-4) {
      const container = containerRef.current;
      const cx = (container?.clientWidth ?? 1000) / 2;
      const cy = (container?.clientHeight ?? 800) / 2;

      // Punkt w świecie na środku ekranu przed obrotem
      const rotPrevRad = (prevRot * Math.PI) / 180;
      const cosPrev = Math.cos(rotPrevRad);
      const sinPrev = Math.sin(rotPrevRad);
      const uPrev = (cx - viewState.panX) / viewState.scale;
      const vPrev = (cy - viewState.panY) / viewState.scale;
      const wx = uPrev * cosPrev + vPrev * sinPrev;
      const wy = uPrev * sinPrev - vPrev * cosPrev;

      // Wyznaczenie nowego panX i panY dla nowego kąta
      const rotNewRad = (viewRotationDeg * Math.PI) / 180;
      const cosNew = Math.cos(rotNewRad);
      const sinNew = Math.sin(rotNewRad);
      const uNew = wx * cosNew + wy * sinNew;
      const vNew = wx * sinNew - wy * cosNew;

      const newPanX = cx - uNew * viewState.scale;
      const newPanY = cy - vNew * viewState.scale;

      prevRotationRef.current = viewRotationDeg;
      setViewState((prev) => ({
        ...prev,
        panX: newPanX,
        panY: newPanY,
      }));
    } else {
      prevRotationRef.current = viewRotationDeg;
    }
  }, [viewRotationDeg, viewState.scale, containerRef]);

  const viewportMatrix = useMemo(() => {
    return createViewportMatrix(viewState.panX, viewState.panY, viewState.scale, viewRotationDeg);
  }, [viewState.panX, viewState.panY, viewState.scale, viewRotationDeg]);

  const invViewportMatrix = useMemo(() => {
    return invertAffineMatrix(viewportMatrix);
  }, [viewportMatrix]);

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const pt = transformPoint(viewportMatrix, wx, wy);
      return { sx: pt.x, sy: pt.y };
    },
    [viewportMatrix]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const pt = transformPoint(invViewportMatrix, sx, sy);
      return { wx: pt.x, wy: pt.y };
    },
    [invViewportMatrix]
  );

  const fitToExtents = useCallback((options?: boolean | FitToExtentsOptions) => {
    const container = containerRef.current;
    if (!container) return;

    const opts: FitToExtentsOptions =
      typeof options === 'boolean'
        ? { ignoreSelection: options }
        : (options ?? {});

    const ignoreSelection = opts.ignoreSelection ?? fitRequest?.ignoreSelection ?? false;
    const fitMode = opts.fitMode ?? fitRequest?.fitMode ?? 'contain';
    const preferTested = opts.preferTested ?? fitRequest?.preferTested ?? false;
    const effectiveSelectedBuildingId = ignoreSelection ? null : selectedBuildingId;

    const rect = container.getBoundingClientRect();
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const isKiosk = isMobile || useUiStore.getState().isMobileShowcasePreview;
    const isSidebarActive = useUiStore.getState().isSidebarOpen && !isKiosk;
    const defaultWidth = isSidebarActive ? Math.max(100, window.innerWidth - 380) : window.innerWidth;
    const width = container.clientWidth > 50 ? container.clientWidth : (rect.width > 50 ? rect.width : defaultWidth);
    const height = container.clientHeight > 50 ? container.clientHeight : (rect.height > 50 ? rect.height : window.innerHeight);

    const r = projectRadius ?? 100;

    // Tryb specjalny Kiosk: powiększenie tak, aby cały okrąg zasięgu projektu znalazł się poza canvasem
    if (fitMode === 'project_circle_cover') {
      const diameter = r * 2;
      const targetScale = Math.max(width, height) / diameter;
      setViewState({
        panX: width / 2,
        panY: height / 2,
        scale: Math.max(0.1, Math.min(100, targetScale)),
      });
      return;
    }

    // Gdy brak budynków na scenie: centruj na (0,0) z widokiem na cały okrąg zasięgu
    if (!buildings || buildings.length === 0) {
      const diameter = r * 2;
      const scale = Math.min(width, height) * 0.80 / diameter;
      setViewState({
        panX: width / 2,
        panY: height / 2,
        scale: Math.max(0.1, Math.min(20, scale)),
      });
      return;
    }

    // 1. Ustalenie obiektów docelowych do wycentrowania
    let targetBuildings: BuildingLoop[] = [];
    const hasTested = buildings.some((b) => b.isTested && b.isIncluded !== false);

    if (effectiveSelectedBuildingId) {
      targetBuildings = buildings.filter((b) => b.id === effectiveSelectedBuildingId);
    } else if (hasTested) {
      // Jeśli na scenie są obiekty projektowane (isTested === true), to one definiują główny projekt
      const testedBuildings = buildings.filter(
        (b) => b.isTested && b.isIncluded !== false && b.category !== 'boundary'
      );
      if (testedBuildings.length > 0) {
        targetBuildings = testedBuildings;
      } else {
        targetBuildings = buildings.filter((b) => b.isTested && b.isIncluded !== false);
      }
    } else {
      // Gdy brak obiektów isTested: bierzemy budynki wewnątrz zasięgu projektu (projectRadius)
      const visible = buildings.filter((b) => {
        const lyr = b.layer || 'Domyślna (0)';
        const s = layerSettings?.[lyr] || {};
        return s.isVisible !== false && b.isIncluded !== false;
      });
      const candidates = visible.length > 0 ? visible : buildings.filter((b) => b.isIncluded !== false);
      const cubature = candidates.filter((b) => b.category !== 'boundary');
      const basePool = cubature.length > 0 ? cubature : candidates;

      // Ograniczamy do obiektów w promieniu zasięgu projektu
      const inProjectRadius = basePool.filter((b) => {
        if (!b.vertices || b.vertices.length === 0) return false;
        let cx = 0;
        let cy = 0;
        for (const v of b.vertices) {
          cx += v.x;
          cy += v.y;
        }
        cx /= b.vertices.length;
        cy /= b.vertices.length;
        return Math.hypot(cx, cy) <= r * 1.25;
      });

      targetBuildings = inProjectRadius.length > 0 ? inProjectRadius : basePool;
    }

    const allPoints: Point2D[] = [];
    for (const bldg of targetBuildings) {
      if (Array.isArray(bldg.vertices)) {
        for (const v of bldg.vertices) {
          if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) allPoints.push(v);
        }
      }
      if (Array.isArray(bldg.holes)) {
        for (const hole of bldg.holes) {
          if (Array.isArray(hole)) {
            for (const v of hole) {
              if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) allPoints.push(v);
            }
          }
        }
      }
      if (Array.isArray(bldg.storyPolygons)) {
        for (const sp of bldg.storyPolygons) {
          if (Array.isArray(sp.polygon)) {
            for (const v of sp.polygon) {
              if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) allPoints.push(v);
            }
          }
        }
      }
      if (Array.isArray(bldg.zonePolygons)) {
        for (const zp of bldg.zonePolygons) {
          if (Array.isArray(zp.polygon)) {
            for (const v of zp.polygon) {
              if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) allPoints.push(v);
            }
          }
        }
      }
    }

    if (allPoints.length === 0) {
      // Brak prawidłowych wierzchołków — fallback do widoku okręgu
      const diameter = r * 2;
      const scale = Math.min(width, height) * 0.80 / diameter;
      setViewState({
        panX: width / 2,
        panY: height / 2,
        scale: Math.max(0.1, Math.min(20, scale)),
      });
      return;
    }

    const rot = (viewRotationDeg * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    let rMinU = Infinity;
    let rMaxU = -Infinity;
    let rMinV = Infinity;
    let rMaxV = -Infinity;
    for (const p of allPoints) {
      const u = p.x * cos + p.y * sin;
      const v = -p.x * sin + p.y * cos;
      if (u < rMinU) rMinU = u;
      if (u > rMaxU) rMaxU = u;
      if (v < rMinV) rMinV = v;
      if (v > rMaxV) rMaxV = v;
    }
    const rBboxWidth = Math.max(5, rMaxU - rMinU);
    const rBboxHeight = Math.max(5, rMaxV - rMinV);
    const rotatedCenterU = (rMinU + rMaxU) / 2;
    const rotatedCenterV = (rMinV + rMaxV) / 2;

    const defaultScaleFactor = fitMode === 'cover' ? 1.0 : (effectiveSelectedBuildingId ? 0.80 : 0.92);
    const scaleFactor = opts.scaleFactor ?? fitRequest?.scaleFactor ?? defaultScaleFactor;
    const scaleX = (width * scaleFactor) / rBboxWidth;
    const scaleY = (height * scaleFactor) / rBboxHeight;
    const newScale = Math.max(
      0.001,
      Math.min(100, fitMode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY))
    );

    const panX = width / 2 - rotatedCenterU * newScale;
    const panY = height / 2 + rotatedCenterV * newScale;

    setViewState({
      panX,
      panY,
      scale: newScale,
    });
  }, [buildings, viewRotationDeg, containerRef, selectedBuildingId, layerSettings, projectRadius, fitRequest]);

  useEffect(() => {
    if (!fitRequest?.nonce) return;
    const opts: FitToExtentsOptions = {
      ignoreSelection: fitRequest.ignoreSelection,
      fitMode: fitRequest.fitMode,
      preferTested: fitRequest.preferTested,
      scaleFactor: fitRequest.scaleFactor,
    };
    fitToExtents(opts);
    const t = setTimeout(() => fitToExtents(opts), 100);
    return () => clearTimeout(t);
  }, [
    fitRequest?.nonce,
    fitRequest?.ignoreSelection,
    fitRequest?.fitMode,
    fitRequest?.preferTested,
    fitRequest?.scaleFactor,
    fitToExtents,
  ]);

  return {
    viewState,
    setViewState,
    scheduleViewState,
    viewportMatrix,
    invViewportMatrix,
    worldToScreen,
    screenToWorld,
    fitToExtents,
  };
}
