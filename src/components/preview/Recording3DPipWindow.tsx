// src/components/preview/Recording3DPipWindow.tsx
// Pływające okno podglądu 3D (Picture-in-Picture) w polu rzutni i nagrywania CAD
// Wierne odwzorowanie 1:1 oryginalnego podglądu (bez sztucznej górnej belki)

import React, { useEffect, useMemo, useRef } from 'react';
import { useSceneStore, useUiStore } from '../../store';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';
import { useLocalizedBuilding } from '@/hooks/useLocalizedBuilding';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { filterActiveVariantBuildings, findSelectedBuilding } from '@/utils/geometrySelectors';
import { generateSweepPolygon } from '@/utils/math2d/sweep';
import { applyBuildingModifiers } from '@/engine/modifiers/modifierPipeline';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const Recording3DPipWindow: React.FC = () => {
  const isRecording = useActionRecorderStore((s) => s.isRecording);
  const isCountingDown = useActionRecorderStore((s) => s.isCountingDown);
  const show3DPreview = useActionRecorderStore((s) => s.settings.show3DPreview);
  const pipPosition = useActionRecorderStore((s) => s.settings.pipPosition);
  const pipSize = useActionRecorderStore((s) => s.settings.pipSize);
  const setPipCanvas = useActionRecorderStore((s) => s.setPipCanvas);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);
  const liveVertexPreview = useCadToolStore((s) => s.liveVertexPreview);

  const isDemoRecordingActive = (isRecording || isCountingDown) && show3DPreview;

  // Aktywny budynek: zaznaczony (niezależnie od aktywnego wariantu) -> projektowany (isTested, tylko
  // aktywny wariant) -> pierwszy na liście (wyłącznie aktywny wariant). Jawne zaznaczenie użytkownika
  // ma pierwszeństwo, żeby podgląd nigdy nie podmieniał obiektu w ciszy, gdy wybrany obiekt należy
  // do nieaktywnego wariantu A/B.
  const activeBuilding = useMemo(() => {
    const selected = findSelectedBuilding(buildings, selectedBuildingId);
    if (selected) return selected;
    const activeBuildings = filterActiveVariantBuildings(buildings);
    const tested = activeBuildings.find((b) => b.isTested && b.category !== 'boundary');
    if (tested) return tested;
    return activeBuildings.find((b) => b.category !== 'boundary') || null;
  }, [buildings, selectedBuildingId]);

  const patchedActiveBuilding = useMemo(() => {
    if (
      !activeBuilding ||
      !liveVertexPreview ||
      liveVertexPreview.buildingId !== activeBuilding.id
    ) {
      return activeBuilding;
    }
    const isSweep = Array.isArray(activeBuilding.sweepPath) && activeBuilding.sweepPath.length >= 2;
    let candidate = activeBuilding;
    if (isSweep) {
      const sweepPath = activeBuilding.sweepPath!.map((v, idx) =>
        idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
      );
      const sweepPoly = generateSweepPolygon(
        sweepPath,
        activeBuilding.sweepWidth || 12,
        activeBuilding.sweepAlignment || 'center'
      );
      candidate = { ...activeBuilding, sweepPath, vertices: sweepPoly };
    } else {
      const vertices = activeBuilding.vertices.map((v, idx) =>
        idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
      );
      candidate = { ...activeBuilding, vertices };
    }
    const modRes = applyBuildingModifiers(candidate);
    return {
      ...candidate,
      storyPolygons: modRes.storyPolygons && modRes.storyPolygons.length > 0 ? modRes.storyPolygons : undefined,
      zonePolygons: modRes.zonePolygons && modRes.zonePolygons.length > 0 ? modRes.zonePolygons : undefined,
      segments: modRes.segments,
    };
  }, [activeBuilding, liveVertexPreview]);

  const activeHighlight = getActiveHighlightEdgeIndex(
    patchedActiveBuilding?.modifiers,
    expandedModifierId
  );

  // Lokalny układ współrzędnych obiektu (patrz useLocalizedBuilding.ts) - pozycja obiektu w
  // scenie nie może wpływać na kadr podglądu 3D.
  const { localizedBuilding, localizedGroupBuildings } = useLocalizedBuilding(
    activeBuilding,
    patchedActiveBuilding,
    buildings
  );

  // Rejestracja Canvasu WebGL Three.js w store do nagrywania wideo
  useEffect(() => {
    if (!isDemoRecordingActive || !containerRef.current) {
      setPipCanvas(null);
      return;
    }
    const canvas = containerRef.current.querySelector('canvas');
    if (canvas) {
      setPipCanvas(canvas as HTMLCanvasElement);
    }
  });

  if (!isDemoRecordingActive || !localizedBuilding) {
    return null;
  }

  // Zwiększone wymiary w proporcji 4:3 (identycznie jak w oryginale)
  const dimensions = {
    small: { width: 360, height: 270 },
    medium: { width: 440, height: 330 },
    large: { width: 520, height: 390 },
  }[pipSize || 'medium'];

  const positionStyles: React.CSSProperties = {
    'bottom-right': { bottom: '24px', right: '24px' },
    'top-right': { top: '60px', right: '24px' },
    'bottom-left': { bottom: '24px', left: '24px' },
  }[pipPosition || 'bottom-right'];

  return (
    <div
      ref={containerRef}
      className="recording-pip-card"
      style={{
        position: 'absolute',
        ...positionStyles,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        zIndex: 50,
      }}
    >
      <BuildingIsoPreview
        building={localizedBuilding}
        groupBuildings={localizedGroupBuildings}
        highlightEdgeIndex={activeHighlight}
        hideToolbar={false}
      />
    </div>
  );
};
