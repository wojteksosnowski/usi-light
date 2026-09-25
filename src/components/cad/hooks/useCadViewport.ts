import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ViewportState } from '../types';
import { BuildingLoop, Point2D } from '../../../types/geometry';
import { useUiStore } from '../../../store/useUiStore';
import { createViewportMatrix, invertAffineMatrix, transformPoint, AffineMatrix2D } from '@/utils/math2d';
import { getCanvasWorkingWidth, getKioskLayoutFlags } from '../../../hooks/useIsMobile';
import { FitRequestOptions as FitToExtentsOptions } from '../../../store/useCadToolStore';
import { GeometryCompiler } from '@/engine/compiler/GeometryCompiler';

export function useCadViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  buildings: BuildingLoop[],
  viewRotationDeg: number,
  fitRequest?: FitToExtentsOptions & { nonce: number; ignoreSelection: boolean },
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

  const fitRequestRef = useRef(fitRequest);
  fitRequestRef.current = fitRequest;

  const fitToExtents = useCallback((options?: boolean | FitToExtentsOptions) => {
    const container = containerRef.current;
    if (!container) return;

    const currentFitRequest = fitRequestRef.current;
    const opts: FitToExtentsOptions =
      typeof options === 'boolean'
        ? { ignoreSelection: options }
        : (options ?? {});

    const ignoreSelection = opts.ignoreSelection ?? currentFitRequest?.ignoreSelection ?? false;
    const fitMode = opts.fitMode ?? currentFitRequest?.fitMode ?? 'contain';
    const preferTested = opts.preferTested ?? currentFitRequest?.preferTested ?? false;
    const effectiveSelectedBuildingId = ignoreSelection ? null : selectedBuildingId;

    const rect = container.getBoundingClientRect();
    const { isSidebarActive } = getKioskLayoutFlags(
      useUiStore.getState().isMobileShowcasePreview,
      useUiStore.getState().isSidebarOpen
    );
    const defaultWidth = getCanvasWorkingWidth(isSidebarActive);
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

      // Ograniczamy do obiektów w promieniu zasięgu projektu (O(1) z Canonical Precomputed Geometry)
      const inProjectRadius = basePool.filter((b) => {
        const bounds = b.computed?.representation2D?.bounds2D;
        if (bounds) {
          const cx = (bounds.min.x + bounds.max.x) * 0.5;
          const cy = (bounds.min.y + bounds.max.y) * 0.5;
          return Math.hypot(cx, cy) <= r * 1.25;
        }
        if (!b.vertices || b.vertices.length === 0) return false;
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < b.vertices.length; i++) {
          cx += b.vertices[i].x;
          cy += b.vertices[i].y;
        }
        cx /= b.vertices.length;
        cy /= b.vertices.length;
        return Math.hypot(cx, cy) <= r * 1.25;
      });

      targetBuildings = inProjectRadius.length > 0 ? inProjectRadius : basePool;
    }

    let rMinU = Infinity;
    let rMaxU = -Infinity;
    let rMinV = Infinity;
    let rMaxV = -Infinity;
    let hasPoints = false;

    const isRotated = Math.abs(viewRotationDeg) > 1e-4;

    if (!isRotated) {
      // Szybka ścieżka O(1) Canonical Precomputed Geometry dla nieobróconego widoku
      for (let i = 0; i < targetBuildings.length; i++) {
        const b = targetBuildings[i];
        const bounds = b.computed?.representation2D?.bounds2D ?? GeometryCompiler.getBuildingBounds2D(b);
        if (bounds && Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.x)) {
          if (bounds.min.x < rMinU) rMinU = bounds.min.x;
          if (bounds.max.x > rMaxU) rMaxU = bounds.max.x;
          if (bounds.min.y < rMinV) rMinV = bounds.min.y;
          if (bounds.max.y > rMaxV) rMaxV = bounds.max.y;
          hasPoints = true;
        }
      }
    }

    if (!hasPoints) {
      // Strumieniowe rzutowanie dla widoku obróconego lub gdy brak zbuforowanych bounds2D (zero allPoints alokacji, pominięcie holes/zones)
      const rot = (viewRotationDeg * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (let bIdx = 0; bIdx < targetBuildings.length; bIdx++) {
        const bldg = targetBuildings[bIdx];
        if (bldg.computed) {
          const rep2D = bldg.computed.representation2D;
          const ext = rep2D.footprintBase.exterior;
          for (let i = 0; i < ext.length; i++) {
            const v = ext[i];
            if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
              const u = v.x * cos + v.y * sin;
              const w = -v.x * sin + v.y * cos;
              if (u < rMinU) rMinU = u;
              if (u > rMaxU) rMaxU = u;
              if (w < rMinV) rMinV = w;
              if (w > rMaxV) rMaxV = w;
              hasPoints = true;
            }
          }
          if (rep2D.storySlices) {
            for (let sIdx = 0; sIdx < rep2D.storySlices.length; sIdx++) {
              const sliceExt = rep2D.storySlices[sIdx].footprint.exterior;
              for (let i = 0; i < sliceExt.length; i++) {
                const v = sliceExt[i];
                if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
                  const u = v.x * cos + v.y * sin;
                  const w = -v.x * sin + v.y * cos;
                  if (u < rMinU) rMinU = u;
                  if (u > rMaxU) rMaxU = u;
                  if (w < rMinV) rMinV = w;
                  if (w > rMaxV) rMaxV = w;
                  hasPoints = true;
                }
              }
            }
          }
        } else {
          if (Array.isArray(bldg.vertices)) {
            for (let i = 0; i < bldg.vertices.length; i++) {
              const v = bldg.vertices[i];
              if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
                const u = v.x * cos + v.y * sin;
                const w = -v.x * sin + v.y * cos;
                if (u < rMinU) rMinU = u;
                if (u > rMaxU) rMaxU = u;
                if (w < rMinV) rMinV = w;
                if (w > rMaxV) rMaxV = w;
                hasPoints = true;
              }
            }
          }
          if (Array.isArray(bldg.storyPolygons)) {
            for (let sIdx = 0; sIdx < bldg.storyPolygons.length; sIdx++) {
              const poly = bldg.storyPolygons[sIdx].polygon;
              if (Array.isArray(poly)) {
                for (let i = 0; i < poly.length; i++) {
                  const v = poly[i];
                  if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
                    const u = v.x * cos + v.y * sin;
                    const w = -v.x * sin + v.y * cos;
                    if (u < rMinU) rMinU = u;
                    if (u > rMaxU) rMaxU = u;
                    if (w < rMinV) rMinV = w;
                    if (w > rMaxV) rMaxV = w;
                    hasPoints = true;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (!hasPoints) {
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

    const rBboxWidth = Math.max(5, rMaxU - rMinU);
    const rBboxHeight = Math.max(5, rMaxV - rMinV);
    const rotatedCenterU = (rMinU + rMaxU) / 2;
    const rotatedCenterV = (rMinV + rMaxV) / 2;

    const defaultScaleFactor = fitMode === 'cover' ? 1.0 : (effectiveSelectedBuildingId ? 0.80 : 0.92);
    const scaleFactor = opts.scaleFactor ?? currentFitRequest?.scaleFactor ?? defaultScaleFactor;
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
  }, [buildings, viewRotationDeg, containerRef, selectedBuildingId, layerSettings, projectRadius]);

  const fitToExtentsRef = useRef(fitToExtents);
  fitToExtentsRef.current = fitToExtents;

  const lastHandledNonceRef = useRef<number>(0);

  useEffect(() => {
    const nonce = fitRequest?.nonce;
    if (!nonce || nonce === lastHandledNonceRef.current) return;
    lastHandledNonceRef.current = nonce;

    const opts: FitToExtentsOptions = {
      ignoreSelection: fitRequest.ignoreSelection,
      fitMode: fitRequest.fitMode,
      preferTested: fitRequest.preferTested,
      scaleFactor: fitRequest.scaleFactor,
    };
    fitToExtentsRef.current(opts);
    const t = setTimeout(() => fitToExtentsRef.current(opts), 100);
    return () => clearTimeout(t);
  }, [fitRequest?.nonce]);

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
